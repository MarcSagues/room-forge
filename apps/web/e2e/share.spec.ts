import { expect, type Page, test } from '@playwright/test';

declare global {
  interface Window {
    __violations?: string[];
  }
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/** Ready once the scene has drawn a frame and the camera is up (editor and viewer alike). */
const sceneReady = (page: Page) =>
  page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );

/** Records policy violations and page errors, so the viewer is held to the CSP like the rest. */
async function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__violations?.push(`${event.violatedDirective} blocked ${event.blockedURI}`);
    });
  });
  return { errors, violations: () => page.evaluate(() => window.__violations ?? []) };
}

/** Adds a box; returns why the session refused it, or `null` if it was added. */
const tryAddObject = (page: Page, id: string, x: number) =>
  page.evaluate(
    ({ id, x }) => {
      const hook = window.__RF__;
      if (!hook) throw new Error('E2E hook missing');
      const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
      const result = hook.session.execute(
        hook.commands.addObject({
          id,
          catalogId: 'test.box',
          roomId,
          position: [x, 0, 1.2345678],
          rotationY: 0.5,
        }),
      );
      return result.ok ? null : result.error.code;
    },
    { id, x },
  );

const objectCount = (page: Page) =>
  page.evaluate(() => Object.keys(window.__RF__?.session.getState().document.objects ?? {}).length);

test('share copies a link; it opens read-only elsewhere, and a copy is editable', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/editor/');
  await sceneReady(page);
  for (const [i, id] of ['desk', 'chair', 'lamp'].entries()) {
    expect(await tryAddObject(page, id, 1 + i * 0.7)).toBeNull();
  }
  const count = await objectCount(page);

  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByText(/Link copied\. Anyone with it/)).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/view\/#v1\.[A-Za-z0-9_-]+$/);
  expect(link.length).toBeLessThan(4096);

  // Another browser profile: nothing of the first one's storage, as for a person sent the link.
  const other = await browser.newContext({ baseURL: baseURL ?? '' });
  const viewer = await other.newPage();
  const seen = await watch(viewer);
  await viewer.goto(link);
  await sceneReady(viewer);

  await expect(viewer.getByRole('heading', { name: 'A shared room, read-only' })).toBeVisible();
  await expect(
    viewer.getByText('You are looking at “Untitled project”.', { exact: false }),
  ).toBeVisible();
  expect(await objectCount(viewer)).toBe(count);
  expect(await tryAddObject(viewer, 'shelf', 2)).toBe('read-only');
  expect(await viewer.evaluate(() => window.__RF__?.autosave.state() ?? null)).toBeNull();
  // No editing chrome: no top bar with undo, export or share.
  await expect(viewer.getByRole('button', { name: 'Share' })).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: /undo/i })).toHaveCount(0);
  // Looking around still works.
  await viewer.getByRole('button', { name: 'Top' }).click();
  await expect
    .poll(() => viewer.evaluate(() => window.__RF__?.session.getState().view))
    .toBe('top');
  expect(await seen.violations()).toEqual([]);
  expect(seen.errors).toEqual([]);

  await viewer.getByRole('button', { name: 'Make a copy to edit' }).click();
  await viewer.waitForURL(/\/editor\/\?project=/);
  await sceneReady(viewer);
  await viewer.waitForFunction(() => window.__RF__?.autosave.state()?.status === 'saved');
  expect(await objectCount(viewer)).toBe(count);
  expect(await tryAddObject(viewer, 'shelf', 2)).toBeNull();

  await other.close();
});

test('a damaged or cut link says so kindly instead of crashing', async ({ page }) => {
  const seen = await watch(page);
  await page.goto('/view/#v1.this-is-not-a-room');
  await expect(page.getByRole('heading', { name: 'This link cannot be opened' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /damaged or incomplete/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your projects' })).toBeVisible();

  await page.goto('/view/');
  await expect(page.getByRole('alert').filter({ hasText: /has no room in it/ })).toBeVisible();
  expect(seen.errors).toEqual([]);
  expect(await seen.violations()).toEqual([]);
});
