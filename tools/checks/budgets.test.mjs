// Tests for the quality budgets (tools/checks/budgets.mjs and quality-budgets.json), including the
// cases that must fail: a check that cannot fail is not a gate.
// Run with: pnpm test:arch   (node --test, no extra dependencies)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compare,
  describeFailures,
  failures,
  gzipSize,
  kB,
  loadBudgets,
  renderReport,
  summarizeChunks,
} from './budgets.mjs';

test('a value inside its limit passes, one over it fails, and the limit itself is allowed', () => {
  const rows = compare(
    { calls: 40, triangles: 500, programs: 5 },
    { calls: 48, triangles: 499, programs: 5 },
  );
  assert.deepEqual(
    failures(rows).map((row) => row.metric),
    ['triangles'],
  );
  assert.equal(
    rows.find((row) => row.metric === 'programs').over,
    false,
    'at the limit is not over',
  );
});

test('a limit that was not measured fails: a check that stopped measuring must not pass', () => {
  const rows = compare({ calls: 10 }, { calls: 48, textures: 3 });
  assert.deepEqual(
    failures(rows).map((row) => [row.metric, row.missing]),
    [['textures', true]],
  );
  assert.match(
    describeFailures('scene', rows)[0],
    /textures has a limit \(3\) but was not measured/,
  );
});

test('a measurement without a limit is reported and never fails', () => {
  const rows = compare({ calls: 10, lines: 3 }, { calls: 48 });
  assert.deepEqual(failures(rows), []);
  assert.deepEqual(
    rows.map((row) => row.metric),
    ['calls', 'lines'],
  );
});

test('the failure message says how far over the budget it is', () => {
  const rows = compare({ '/editor/': 612.34 }, { '/editor/': 580 });
  assert.deepEqual(describeFailures('bundle', rows), [
    'bundle: /editor/ is 612.3, over the budget of 580',
  ]);
});

test('the bundle gate fails for a route that grows past its budget (the PR that adds 100 kB)', () => {
  const budgets = loadBudgets();
  const limit = budgets.bundle.initialJsGzipKb['/editor/'];
  const today = compare({ '/editor/': limit - 1 }, { '/editor/': limit });
  const afterTheBigPr = compare({ '/editor/': limit + 100 }, { '/editor/': limit });
  assert.deepEqual(failures(today), []);
  assert.equal(failures(afterTheBigPr).length, 1);
});

test('the scene gate fails when draw calls or triangles exceed the pattern scene budget', () => {
  const { limits } = loadBudgets().scene;
  const measured = { ...limits, calls: limits.calls + 1 };
  assert.deepEqual(
    failures(compare(measured, limits)).map((row) => row.metric),
    ['calls'],
  );
  assert.deepEqual(
    failures(compare({ ...limits, triangles: limits.triangles * 10 }, limits)).map(
      (row) => row.metric,
    ),
    ['triangles'],
  );
});

test('gzipSize is smaller than the input for compressible text and exact for kB', () => {
  const text = Buffer.from('const a = 1;\n'.repeat(1000));
  assert.ok(gzipSize(text) < text.length / 10);
  assert.equal(kB(2048), 2);
});

test('summarizeChunks sorts by gzip size and totals', () => {
  const summary = summarizeChunks([
    { file: 'b.js', bytes: 100, gzip: 30 },
    { file: 'a.js', bytes: 500, gzip: 90 },
    { file: 'c.js', bytes: 10, gzip: 30 },
  ]);
  assert.deepEqual(
    summary.chunks.map((chunk) => chunk.file),
    ['a.js', 'b.js', 'c.js'],
  );
  assert.equal(summary.totalGzip, 150);
  assert.equal(summary.totalBytes, 610);
});

test('the report shows budget, target and status per route, and the scene counters', () => {
  const budgets = loadBudgets();
  const editor = summarizeChunks([{ file: 'chunks/big.js', bytes: 2_000_000, gzip: 700 * 1024 }]);
  const landing = summarizeChunks([{ file: 'chunks/small.js', bytes: 100_000, gzip: 100 * 1024 }]);
  const report = renderReport(
    { routes: { '/': landing, '/editor/': editor }, scene: { ...budgets.scene.limits, calls: 1 } },
    budgets,
  );
  assert.match(report, /\| `\/` \| 100\.0 kB \| 240 kB \| - \| ok \|/);
  assert.match(report, /\| `\/editor\/` \| 700\.0 kB \| 580 kB \| 450 kB \| over \|/);
  assert.match(report, /Chunks of <code>\/editor\/<\/code>/);
  assert.match(report, /Pattern scene \(30 objects, 0 lights\)/);
  assert.match(report, /\| calls \| 1 \| 48 \| ok \|/);
});

// ── quality-budgets.json ────────────────────────────────────────
// The numbers may only be loosened with a reason in the PR: these are the floor they cannot go
// below silently. Changing a number below also means changing this test, in the same diff, where a
// reviewer sees it.

test('the coverage thresholds are at least the ones the project committed to', () => {
  const { coverage } = loadBudgets();
  assert.ok(coverage.core.lines >= 90, 'core lines');
  assert.ok(coverage.core.branches >= 85, 'core branches');
  assert.ok(coverage.web.lines >= 70, 'web lines');
});

test('every route budget is a positive number and never below its own target', () => {
  const { bundle } = loadBudgets();
  for (const [route, limit] of Object.entries(bundle.initialJsGzipKb)) {
    assert.ok(Number.isFinite(limit) && limit > 0, `${route} has a budget`);
    const target = bundle.targetGzipKb?.[route];
    if (target !== undefined)
      assert.ok(limit >= target, `${route}: the budget is below its target`);
  }
  assert.ok('/editor/' in bundle.initialJsGzipKb, 'the editor has a budget');
});

test('the editor target is the 450 kB of the issue, and the landing page stays light', () => {
  const { bundle } = loadBudgets();
  assert.equal(bundle.targetGzipKb['/editor/'], 450);
  assert.ok(bundle.initialJsGzipKb['/'] < bundle.initialJsGzipKb['/editor/']);
});

test('the pattern scene has every counter limited', () => {
  const { scene } = loadBudgets();
  assert.deepEqual(Object.keys(scene.limits).sort(), [
    'calls',
    'geometries',
    'programs',
    'textures',
    'triangles',
  ]);
  for (const [name, limit] of Object.entries(scene.limits)) {
    assert.ok(Number.isInteger(limit) && limit > 0, `${name} has a positive limit`);
  }
  assert.equal(scene.pattern.objects, 30);
});
