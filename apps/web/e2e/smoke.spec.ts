import { expect, type Page, test } from '@playwright/test';

/** Fails the test on any console error or uncaught exception during the page's lifetime. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('home loads and links to the editor', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'RoomForge' })).toBeVisible();
  await page.getByRole('link', { name: 'Open the editor' }).click();
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.getByRole('main', { name: 'Viewport' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('editor loads the shell and exposes the E2E hook', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/editor/');
  await expect(page.getByRole('main', { name: 'Viewport' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Catalog panel' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Properties panel' })).toBeVisible();
  // The hook is not serializable (it holds the session): check its shape from inside the page.
  expect(await page.evaluate(() => Object.keys(window.__RF__ ?? {}).sort())).toEqual([
    'camera',
    'commands',
    'info',
    'session',
  ]);
  expect(errors).toEqual([]);
});

test('WebGL2 is available (software rendering in CI)', async ({ page }) => {
  await page.goto('/editor/');
  const gl = await page.evaluate(() => {
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context) return null;
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    return {
      version: context.getParameter(context.VERSION) as string,
      renderer: debug
        ? (context.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string)
        : (context.getParameter(context.RENDERER) as string),
    };
  });
  expect(gl, 'getContext("webgl2") returned null').not.toBeNull();
  test.info().annotations.push({ type: 'webgl', description: `${gl?.version} · ${gl?.renderer}` });
});

// P1-06 acceptance criteria: no page scroll at the documented breakpoints.
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
]) {
  test(`editor layout fits ${viewport.width}px without page scroll`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/editor/');
    await expect(page.getByRole('main', { name: 'Viewport' })).toBeVisible();
    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(size).toEqual({ scrollWidth: viewport.width, scrollHeight: viewport.height });
    await test.info().attach(`layout-${viewport.width}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

test('editor shows only the viewer banner below 768px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/editor/');
  await expect(page.getByText('Open RoomForge on a computer to edit.')).toBeVisible();
  await expect(page.getByRole('main', { name: 'Viewport' })).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);
});
