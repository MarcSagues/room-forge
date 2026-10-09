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

function room(page: Page) {
  return page.evaluate(() => {
    const state = window.__RF__?.session.getState();
    const found = state ? Object.values(state.document.rooms)[0] : undefined;
    if (!found || !state) throw new Error('no room');
    return {
      width: found.shape.width,
      depth: found.shape.depth,
      height: found.height,
      canUndo: state.history.canUndo,
      selection: [...state.selection],
    };
  });
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await settle(page);
});

test('resizing the room redraws it, and one undo brings the old size back', async ({ page }) => {
  const canvas = page.locator('main canvas');
  const picture = await canvas.screenshot();
  const panel = page.getByRole('region', { name: 'Room size' });

  await panel.getByRole('textbox', { name: 'Width' }).fill('6');
  await panel.getByRole('textbox', { name: 'Depth' }).fill('350');
  await expect(panel.getByRole('button', { name: 'Apply size' })).toBeDisabled(); // 350 m is no depth
  await panel.getByRole('button', { name: 'cm' }).click();
  await panel.getByRole('button', { name: 'Apply size' }).click();
  await settle(page);

  expect(await room(page)).toMatchObject({ width: 6, depth: 3.5, height: 2.6 });
  expect((await canvas.screenshot()).equals(picture)).toBe(false);

  await page.evaluate(() => window.__RF__?.session.undo());
  expect(await room(page)).toMatchObject({ width: 4, depth: 4.5, canUndo: false });
});

test('values outside the limits cannot be confirmed', async ({ page }) => {
  const panel = page.getByRole('region', { name: 'Room size' });
  const width = panel.getByRole('textbox', { name: 'Width' });
  for (const text of ['1.9', '12.1', '', 'x']) {
    await width.fill(text);
    await expect(width).toHaveAttribute('aria-invalid', 'true');
    await expect(panel.getByRole('button', { name: 'Apply size' })).toBeDisabled();
    await width.press('Enter');
  }
  expect(await room(page)).toMatchObject({ width: 4, canUndo: false });
});
