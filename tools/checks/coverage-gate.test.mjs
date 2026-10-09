// Proves the coverage gate (P7-03): thresholds that are not met make the run fail, and ones that are
// met do not. It runs the real vitest configuration on one small test file, pointing it at a
// budgets file written here (QUALITY_BUDGETS_FILE), so the glob thresholds of vitest.config.mts are
// the ones exercised.
// Run with: pnpm test:arch   (node --test, no extra dependencies)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vitest = join(
  dirname(createRequire(join(root, 'package.json')).resolve('vitest/package.json')),
  'vitest.mjs',
);

function runWith(coverage) {
  const directory = mkdtempSync(join(tmpdir(), 'rf-coverage-'));
  const file = join(directory, 'budgets.json');
  writeFileSync(file, JSON.stringify({ coverage }));
  try {
    const result = spawnSync(
      process.execPath,
      [
        vitest,
        'run',
        'packages/core/src/domain/ids.test.ts',
        '--coverage',
        '--coverage.reporter=text-summary',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, QUALITY_BUDGETS_FILE: file, PERF_BUDGETS: 'off', CI: '1' },
        timeout: 120_000,
      },
    );
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a core line-coverage threshold that is not met fails the run', () => {
  const { status, output } = runWith({
    core: { lines: 101, branches: 0 },
    web: { lines: 0 },
  });
  assert.notEqual(status, 0);
  assert.match(output, /does not meet "packages\/core\/src\/\*\*" threshold \(101%\)/);
});

test('a core branch-coverage threshold that is not met fails the run', () => {
  const { status, output } = runWith({
    core: { lines: 0, branches: 101 },
    web: { lines: 0 },
  });
  assert.notEqual(status, 0);
  assert.match(output, /branches .* does not meet "packages\/core\/src\/\*\*" threshold \(101%\)/);
});

test('a web coverage threshold that is not met fails the run', () => {
  const { status, output } = runWith({
    core: { lines: 0, branches: 0 },
    web: { lines: 101 },
  });
  assert.notEqual(status, 0);
  assert.match(output, /does not meet "apps\/web\/src\/\*\*" threshold \(101%\)/);
});

test('thresholds that are met let the run pass', () => {
  const { status, output } = runWith({
    core: { lines: 0, branches: 0 },
    web: { lines: 0 },
  });
  assert.equal(status, 0, output);
});
