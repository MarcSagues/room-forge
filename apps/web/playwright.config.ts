import { defineConfig, devices } from '@playwright/test';

// E2E_PORT avoids reusing an unrelated server already listening on 4173 locally.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const isCI = Boolean(process.env.CI);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Every test starts with the storage toasts (P6-09) already dealt with, so a toast never covers what
 * a test clicks; `storage-care.spec.ts` starts from an empty storage to test them.
 */
const SEEN_STORAGE_TOASTS = {
  cookies: [],
  origins: [
    {
      origin: BASE_URL,
      localStorage: [
        { name: 'roomforge.storageWarningShown', value: '1' },
        { name: 'roomforge.backupReminder', value: '{"edits":0,"since":null,"never":true}' },
      ],
    },
  ],
};

/**
 * Chromium flags for WebGL without a GPU (CI runners, headless): ANGLE on top of SwiftShader,
 * the CPU Vulkan/GL implementation bundled with Chromium. See TESTING_STRATEGY §5.
 */
export const WEBGL_FLAGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // CI runners draw WebGL on the CPU (SwiftShader) with every worker busy: a dialog closing or a
  // frame settling can take longer than the 5 s default there, which made specs flake.
  expect: { timeout: isCI ? 10_000 : 5_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    storageState: SEEN_STORAGE_TOASTS,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: WEBGL_FLAGS } },
    },
  ],
  // Serves the static export; `pnpm e2e` builds it first.
  webServer: {
    command: `node scripts/serve-static.mjs out`,
    url: `${BASE_URL}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !isCI,
  },
});
