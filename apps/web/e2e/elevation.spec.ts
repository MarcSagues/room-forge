import { expect, type Page, test } from '@playwright/test';

// P3-16: an object's elevation can be typed in the panel, stepped with the keyboard and dragged
// with Shift in the scene, always as one history entry per edit.

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

/** Adds a placeholder box at a room-local position of the 4 × 4.5 × 2.6 m demo room. */
async function addBox(page: Page, id: string, x: number, z: number) {
  await page.evaluate(
    ({ id, x, z }) => {
      const hook = window.__RF__;
      if (!hook) throw new Error('E2E hook missing');
      const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
      const result = hook.session.execute(
        hook.commands.addObject({
          id,
          catalogId: 'test.box',
          roomId,
          position: [x, 0, z],
          rotationY: 0,
        }),
      );
      if (!result.ok) throw new Error(result.error.message);
    },
    { id, x, z },
  );
  await settle(page);
}

const point = async (page: Page, id: string) => {
  const p = await page.evaluate((target) => window.__RF__?.project(target as never), id);
  if (!p) throw new Error(`${id} is not on screen`);
  return p;
};
const elevation = async (page: Page, id = 'a') =>
  (
    await page.evaluate(
      (target) => window.__RF__?.session.getState().document.objects[target as never]?.transform,
      id,
    )
  )?.position[1];
const undoLabel = (page: Page) =>
  page.evaluate(() => window.__RF__?.session.getState().history.undoLabel);
const undo = async (page: Page) => {
  await page.evaluate(() => window.__RF__?.session.undo());
  await settle(page);
};

const panel = (page: Page) => page.getByRole('complementary', { name: 'Properties panel' });
const field = (page: Page) => panel(page).getByRole('spinbutton', { name: 'Elevation' });

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await addBox(page, 'a', 2, 2.25);
  const a = await point(page, 'a');
  await page.mouse.click(a.x, a.y);
  await expect(field(page)).toHaveValue('0');
});

test('typing an elevation raises the object, drawn higher, in one undo step', async ({ page }) => {
  const before = await point(page, 'a');
  await field(page).fill('120');
  await field(page).press('Enter');
  await settle(page);
  expect(await elevation(page)).toBeCloseTo(1.2);
  // Drawn higher: the same point of the box is now further up the screen.
  expect((await point(page, 'a')).y).toBeLessThan(before.y - 20);
  expect(await undoLabel(page)).toBe('Change elevation');

  await undo(page);
  expect(await elevation(page)).toBe(0);
  expect(await undoLabel(page)).toBe('Add object');
});

test('a value above the ceiling is refused with an accessible error', async ({ page }) => {
  await field(page).fill('300');
  await field(page).press('Enter');
  await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(panel(page).getByRole('alert')).toContainText('Enter a value from 0 to');
  expect(await elevation(page)).toBe(0);
  expect(await undoLabel(page)).toBe('Add object');
});

test('arrow keys in the field step the elevation, Shift ten times, as one entry', async ({
  page,
}) => {
  await field(page).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowUp');
  await expect(field(page)).toHaveValue('11');
  await settle(page);
  await undo(page);
  expect(await elevation(page)).toBe(0);
});

test('PageUp/PageDown and Alt+arrows step the selection, one undo per press', async ({ page }) => {
  await page.keyboard.press('PageUp');
  expect(await elevation(page)).toBeCloseTo(0.1);
  await page.waitForTimeout(800); // past the history's merge window: a separate press
  await page.keyboard.press('Alt+ArrowUp');
  expect(await elevation(page)).toBeCloseTo(0.2);
  await page.waitForTimeout(800);
  await page.keyboard.press('Shift+PageUp');
  expect(await elevation(page)).toBeCloseTo(1.2);
  await page.waitForTimeout(800);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(800);
  await page.keyboard.press('PageDown');
  expect(await elevation(page)).toBeCloseTo(1);
  await expect(field(page)).toHaveValue('100');

  await undo(page);
  expect(await elevation(page)).toBeCloseTo(1.1);
  await undo(page);
  await undo(page);
  expect(await elevation(page)).toBeCloseTo(0.2);
});

test('Shift + drag lifts the object in one entry; Esc puts it back', async ({ page }) => {
  const from = await point(page, 'a');

  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 120, { steps: 10 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settle(page);
  expect(await elevation(page)).toBe(0);
  expect(await undoLabel(page)).toBe('Add object');

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 120, { steps: 10 });
  // Mid-gesture the document is untouched; the panel follows the drag.
  expect(await elevation(page)).toBe(0);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await settle(page);

  const lifted = (await elevation(page)) ?? 0;
  expect(lifted).toBeGreaterThan(0.2);
  // On the 10 cm grid, and only up: x and z did not move.
  expect(Math.round(lifted * 10) / 10).toBeCloseTo(lifted, 5);
  const transform = await page.evaluate(
    () => window.__RF__?.session.getState().document.objects['a' as never]?.transform,
  );
  expect(transform?.position[0]).toBe(2);
  expect(transform?.position[2]).toBe(2.25);
  expect(await undoLabel(page)).toBe('Change elevation');
  await undo(page);
  expect(await elevation(page)).toBe(0);
});

test('dragging a raised object over the floor keeps its elevation', async ({ page }) => {
  await field(page).fill('100');
  await field(page).press('Enter');
  await settle(page);
  // Grab the box where it is drawn now, and move it sideways.
  const from = await point(page, 'a');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 120, from.y, { steps: 10 });
  await page.mouse.up();
  await settle(page);

  const transform = await page.evaluate(
    () => window.__RF__?.session.getState().document.objects['a' as never]?.transform,
  );
  expect(transform?.position[1]).toBeCloseTo(1);
  expect(transform?.position[0]).not.toBe(2);
  expect(await undoLabel(page)).toBe('Move object');
});

test('the shortcuts dialog lists the elevation keys and Shift + drag', async ({ page }) => {
  await page.keyboard.press('Shift+?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog.getByText('Raise the selection one grid step (Shift: ×10)')).toBeVisible();
  await expect(dialog.getByText('Lower the selection one grid step (Shift: ×10)')).toBeVisible();
  await expect(dialog.getByText('Raise or lower an object')).toBeVisible();
});
