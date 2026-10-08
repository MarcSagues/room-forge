import { defineConfig } from 'vitest/config';

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
      // Thresholds are informational until P7-03 turns them into gates.
    },
  },
});
