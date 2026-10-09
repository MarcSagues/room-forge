import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// The coverage thresholds are in quality-budgets.json (P7-03) and change only with a reason in the
// PR. QUALITY_BUDGETS_FILE points at another file: tools/checks/coverage-gate.test.mjs uses it to
// prove that a threshold that is not met really fails the run.
const { coverage } = JSON.parse(
  readFileSync(
    process.env.QUALITY_BUDGETS_FILE ?? new URL('./quality-budgets.json', import.meta.url),
    'utf8',
  ),
);

// Two projects (ADR-0008): core runs in Node (fast), web runs in happy-dom.
export default defineConfig({
  test: {
    projects: ['packages/core', 'apps/web'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['packages/core/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
      thresholds: {
        'packages/core/src/**': { lines: coverage.core.lines, branches: coverage.core.branches },
        'apps/web/src/**': { lines: coverage.web.lines },
      },
    },
  },
});
