// Quality budgets (P7-03): coverage, bundle size and scene cost. The numbers live in
// quality-budgets.json at the repository root; this module only compares and reports, so the
// comparison itself is tested (tools/checks/budgets.test.mjs) with cases that must fail.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadBudgets(directory = root) {
  return JSON.parse(readFileSync(join(directory, 'quality-budgets.json'), 'utf8'));
}

/** Bytes after gzip at the strongest level, the figure a host serving gzip would send. */
export function gzipSize(buffer) {
  return gzipSync(buffer, { level: 9 }).length;
}

export const kB = (bytes) => bytes / 1024;

/**
 * Compares measurements with the limits they have and says which are over. A measurement with no
 * limit is reported but never fails; a limit with no measurement fails (a check that stopped
 * measuring must not pass silently).
 * @param {Record<string, number>} measured
 * @param {Record<string, number>} limits
 * @returns {{ metric: string, value: number | undefined, limit: number | undefined, over: boolean, missing: boolean }[]}
 */
export function compare(measured, limits) {
  const metrics = [...new Set([...Object.keys(limits), ...Object.keys(measured)])].sort();
  return metrics.map((metric) => {
    const value = measured[metric];
    const limit = limits[metric];
    const missing = limit !== undefined && value === undefined;
    const over = limit !== undefined && value !== undefined && value > limit;
    return { metric, value, limit, over, missing };
  });
}

/** Rows that fail the budget: over the limit, or a limit nobody measured. */
export function failures(rows) {
  return rows.filter((row) => row.over || row.missing);
}

/** One line per failure, for the message of a failing test. */
export function describeFailures(label, rows) {
  return failures(rows).map((row) =>
    row.missing
      ? `${label}: ${row.metric} has a limit (${row.limit}) but was not measured`
      : `${label}: ${row.metric} is ${format(row.value)}, over the budget of ${format(row.limit)}`,
  );
}

const format = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** `{ file, bytes, gzip }[]` → the same, largest first, with the total. */
export function summarizeChunks(files) {
  const chunks = [...files].sort((a, b) => b.gzip - a.gzip || a.file.localeCompare(b.file));
  return {
    chunks,
    totalGzip: chunks.reduce((sum, chunk) => sum + chunk.gzip, 0),
    totalBytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
  };
}

/** Markdown for the job summary: every route's JavaScript by chunk, and the scene counters. */
export function renderReport({ routes, scene }, budgets) {
  const lines = ['## Quality budgets', ''];
  const limitOf = (route) => budgets.bundle.initialJsGzipKb[route];
  lines.push(
    '### Initial JavaScript per route (gzip)',
    '',
    '| Route | Loaded | Budget | Target | |',
    '|---|---:|---:|---:|---|',
  );
  for (const [route, summary] of Object.entries(routes)) {
    const size = kB(summary.totalGzip);
    const limit = limitOf(route);
    const target = budgets.bundle.targetGzipKb?.[route];
    const status = limit === undefined ? '' : size > limit ? 'over' : 'ok';
    lines.push(
      `| \`${route}\` | ${size.toFixed(1)} kB | ${limit === undefined ? '-' : `${limit} kB`} | ${target === undefined ? '-' : `${target} kB`} | ${status} |`,
    );
  }
  for (const [route, summary] of Object.entries(routes)) {
    lines.push(
      '',
      `<details><summary>Chunks of <code>${route}</code></summary>`,
      '',
      '| Chunk | Raw | Gzip |',
      '|---|---:|---:|',
    );
    for (const chunk of summary.chunks.slice(0, 15)) {
      lines.push(
        `| ${chunk.file} | ${kB(chunk.bytes).toFixed(1)} kB | ${kB(chunk.gzip).toFixed(1)} kB |`,
      );
    }
    lines.push('', '</details>');
  }
  if (scene) {
    lines.push(
      '',
      `### Pattern scene (${budgets.scene.pattern.objects} objects, ${budgets.scene.pattern.lights} lights)`,
      '',
      '| Counter | Measured | Budget | |',
      '|---|---:|---:|---|',
    );
    for (const row of compare(scene, budgets.scene.limits)) {
      const status = row.limit === undefined ? '' : row.over || row.missing ? 'over' : 'ok';
      lines.push(`| ${row.metric} | ${row.value ?? '-'} | ${row.limit ?? '-'} | ${status} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}
