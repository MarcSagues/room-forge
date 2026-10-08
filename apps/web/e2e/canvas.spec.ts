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

/** Waits for the canvas to be mounted and to have drawn its first frame. */
async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(() => (window.__RF__?.info()?.frame ?? 0) >= 1);
}

const frame = (page: Page) => page.evaluate(() => window.__RF__?.info()?.frame ?? -1);
const programs = (page: Page) => page.evaluate(() => window.__RF__?.info()?.programs ?? -1);

/** Runs a command on the live session, from inside the page. */
function resizeFirstRoom(page: Page, width: number) {
  return page.evaluate((w) => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0];
    if (!roomId) throw new Error('no room');
    const result = hook.session.execute(hook.commands.resizeRoom(roomId as never, { width: w }));
    return result.ok;
  }, width);
}

test('the editor draws a canvas without console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await openEditor(page);
  const box = await page.locator('main canvas').boundingBox();
  expect(box?.width).toBeGreaterThan(200);
  expect(box?.height).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

// P2-06: with nothing changing the canvas must not render at all (frameloop="demand").
test('an idle scene renders zero frames', async ({ page }) => {
  await openEditor(page);
  const before = await frame(page);
  await page.waitForTimeout(5000);
  expect(await frame(page)).toBe(before);
});

// P2-06: one document change = exactly one frame, and undo/redo likewise.
test('a document change renders exactly one frame', async ({ page }) => {
  await openEditor(page);
  await page.waitForTimeout(500); // let any initial resize frames settle
  const idle = await frame(page);

  expect(await resizeFirstRoom(page, 5)).toBe(true);
  await page.waitForTimeout(500);
  const afterCommand = await frame(page);
  expect(afterCommand - idle).toBe(1);

  await page.evaluate(() => window.__RF__?.session.undo());
  await page.waitForTimeout(500);
  expect((await frame(page)) - afterCommand).toBe(1);

  await page.waitForTimeout(1000);
  expect((await frame(page)) - afterCommand).toBe(1);
});

const geometries = (page: Page) => page.evaluate(() => window.__RF__?.info()?.geometries ?? -1);

// P2-07: the default 4 × 4.5 m room is floor + ceiling + 4 walls (+ 2 grid layers). Since P2-10
// the ceiling is hidden while editing: three.js neither draws it nor uploads its geometry.
test('the default room draws as 7 calls and 50 triangles', async ({ page }) => {
  await openEditor(page);
  const info = await page.evaluate(() => window.__RF__?.info());
  expect(info?.calls).toBe(7);
  expect(info?.triangles).toBe(2 + 4 * 12);
  expect(info?.geometries).toBe(7);
});

// P2-07: resizing rebuilds geometry; the old buffers must be freed (no GPU memory growth).
test('resizing the room many times does not leak geometries', async ({ page }) => {
  await openEditor(page);
  const baseline = await geometries(page);
  for (let i = 0; i < 12; i += 1) {
    const before = await frame(page);
    expect(await resizeFirstRoom(page, 3 + (i % 5) * 0.5)).toBe(true);
    await page.waitForFunction((f) => (window.__RF__?.info()?.frame ?? 0) > f, before);
  }
  await page.waitForTimeout(300);
  expect(await geometries(page)).toBe(baseline);
  expect((await page.evaluate(() => window.__RF__?.info()))?.triangles).toBe(50);
});

test('changing the document does not compile new shader programs', async ({ page }) => {
  await openEditor(page);
  const before = await programs(page);
  await resizeFirstRoom(page, 4.5);
  await page.waitForTimeout(500);
  expect(await programs(page)).toBe(before);
});

// P2-06: three.js must only load with the editor, never on the landing page.
test('the landing page does not load three.js', async ({ page }) => {
  const signature = /THREE\.WebGLRenderer/;
  const scripts: Promise<string>[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith('.js')) scripts.push(response.text().catch(() => ''));
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'RoomForge' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const bodies = await Promise.all(scripts);
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.some((body) => signature.test(body))).toBe(false);
});

test('control: the editor does load three.js (so the landing check is meaningful)', async ({
  page,
}) => {
  const signature = /THREE\.WebGLRenderer/;
  const scripts: Promise<string>[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith('.js')) scripts.push(response.text().catch(() => ''));
  });
  await openEditor(page);
  const bodies = await Promise.all(scripts);
  expect(bodies.some((body) => signature.test(body))).toBe(true);
});
