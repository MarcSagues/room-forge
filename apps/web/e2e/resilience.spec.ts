import { expect, type Page, test } from '@playwright/test';

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const frame = (page: Page) => page.evaluate(() => window.__RF__?.info()?.frame ?? -1);

async function settle(page: Page) {
  let previous = await frame(page);
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(150);
    const now = await frame(page);
    if (now === previous) return;
    previous = now;
  }
  throw new Error('the canvas never went idle');
}

test('losing the WebGL context shows a notice, and the scene comes back as it was', async ({
  page,
}) => {
  await openEditor(page);
  await page.evaluate(() => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    hook.session.execute(
      hook.commands.addObject({
        id: 'a',
        catalogId: 'test.box',
        roomId,
        position: [2, 0, 2.25],
        rotationY: 0,
      }),
    );
    hook.session.select(['a' as never]);
  });
  await settle(page);
  const canvas = page.locator('main canvas');
  const before = await canvas.screenshot();
  const callsBefore = await page.evaluate(() => window.__RF__?.info()?.calls);

  // Take the context away, the way a GPU reset or a tab under memory pressure would.
  await page.evaluate(() => {
    const element = document.querySelector('main canvas') as HTMLCanvasElement;
    const gl = element.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context is not available');
    (window as unknown as { __lose: typeof extension }).__lose = extension;
    extension.loseContext();
  });
  // (Next adds a role="alert" of its own for route changes, so the notice is found by its text.)
  await expect(
    page.getByText('The graphics context was lost. Trying to restore the view…'),
  ).toBeVisible();
  // The document and the selection live outside the canvas: nothing was lost.
  expect(
    await page.evaluate(() => [...(window.__RF__?.session.getState().selection ?? [])]),
  ).toEqual(['a']);

  await page.evaluate(() =>
    (window as unknown as { __lose: { restoreContext(): void } }).__lose.restoreContext(),
  );
  await expect(page.getByText('The view is back.')).toBeVisible();
  await expect(page.getByText('The graphics context was lost')).toHaveCount(0);
  await settle(page);
  // It drew again, everything: the same draw calls as before (three restarts its frame counter).
  expect(await page.evaluate(() => window.__RF__?.info()?.calls)).toBe(callsBefore);

  // The notice goes away by itself, and the picture is the same one.
  await expect(page.getByText('The view is back.')).toBeHidden({ timeout: 6000 });
  await settle(page);
  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(true);
  expect(
    await page.evaluate(() => [...(window.__RF__?.session.getState().selection ?? [])]),
  ).toEqual(['a']);
  expect(
    await page.evaluate(() =>
      Object.keys(window.__RF__?.session.getState().document.objects ?? {}),
    ),
  ).toEqual(['a']);
});

test('an uncaught error goes into the local log, which is still there after a reload', async ({
  page,
}) => {
  await openEditor(page);
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('simulated crash');
    }, 0);
  });
  await page.waitForFunction(() =>
    (localStorage.getItem('roomforge.errors') ?? '').includes('simulated crash'),
  );
  // The editor keeps working: the error did not take it down.
  await page.keyboard.press('2');
  expect(await page.evaluate(() => window.__RF__?.session.getState().view)).toBe('top');

  await page.reload();
  await openEditor(page);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('roomforge.errors') ?? '[]'),
  );
  expect(stored.at(-1)).toMatchObject({ source: 'window', message: 'Error: simulated crash' });
  expect(JSON.stringify(stored)).not.toContain('rooms'); // no project data in the log
});
