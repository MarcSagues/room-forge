import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const isCI = Boolean(process.env.CI);

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
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
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
    url: `http://127.0.0.1:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !isCI,
  },
});
