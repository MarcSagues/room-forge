import { expect, type Page, test } from '@playwright/test';

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const frame = (page: Page) => page.evaluate(() => window.__RF__?.info()?.frame ?? -1);
const info = () => window.__RF__?.info();

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

/** The materials of the room's surfaces, straight from the document. */
function materials(page: Page) {
  return page.evaluate(() => {
    const state = window.__RF__?.session.getState();
    const room = state ? Object.values(state.document.rooms)[0] : undefined;
    if (!room) throw new Error('no room');
    return {
      floor: room.floor.material,
      ceiling: room.ceiling.material,
      north: room.walls.north.material,
      east: room.walls.east.material,
      south: room.walls.south.material,
      west: room.walls.west.material,
      canUndo: state?.history.canUndo ?? false,
    };
  });
}

const undo = (page: Page) => page.evaluate(() => window.__RF__?.session.undo());

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await settle(page);
});

test('choosing a preset repaints the floor, and one undo brings the old one back', async ({
  page,
}) => {
  const canvas = page.locator('main canvas');
  const before = await materials(page);
  const picture = await canvas.screenshot();

  const panel = page.getByRole('region', { name: 'Room materials' });
  await panel.getByRole('button', { name: 'Walnut' }).click();
  await settle(page);

  const after = await materials(page);
  expect(after.floor.presetId).toBe('wood.walnut');
  expect(after.ceiling).toEqual(before.ceiling);
  expect(after.north).toEqual(before.north);
  expect((await canvas.screenshot()).equals(picture)).toBe(false);

  await undo(page);
  expect((await materials(page)).floor).toEqual(before.floor);
});

test('"All walls" paints the four walls in one history entry; a single wall paints only itself', async ({
  page,
}) => {
  const panel = page.getByRole('region', { name: 'Room materials' });
  const before = await materials(page);

  await panel.getByRole('button', { name: 'West wall' }).click();
  await panel.getByRole('button', { name: 'Deep navy' }).click();
  let now = await materials(page);
  expect(now.west.presetId).toBe('paint.navy');
  expect(now.east).toEqual(before.east);
  await undo(page);

  await panel.getByRole('button', { name: 'All walls' }).click();
  await panel.getByRole('button', { name: 'Sage green' }).click();
  now = await materials(page);
  for (const wall of [now.north, now.east, now.south, now.west]) {
    expect(wall.presetId).toBe('paint.sage');
  }
  await undo(page);
  now = await materials(page);
  expect(now.north).toEqual(before.north);
  expect(now.west).toEqual(before.west);
  expect(now.canUndo).toBe(false);
});

test('dragging the colour is one undo step and compiles nothing new', async ({ page }) => {
  const panel = page.getByRole('region', { name: 'Room materials' });
  await panel.getByRole('button', { name: 'Floor', exact: true }).click();
  const idle = await page.evaluate(info);
  const picker = panel.getByLabel('Pick a tint colour');

  // A drag is thirty input events in a row, well inside the coalescing window: sent from the page
  // in one go, so a slow machine cannot space them out.
  await picker.evaluate((input: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setValue) throw new Error('no value setter');
    for (let step = 0; step < 30; step += 1) {
      const channel = (80 + step * 4).toString(16).padStart(2, '0');
      setValue.call(input, `#ff${channel}${channel}`);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await settle(page);

  const after = await page.evaluate(info);
  expect((await materials(page)).floor.tint).toBe('#ffc4c4');
  expect(after?.programs).toBe(idle?.programs);
  expect(after?.textures).toBe(idle?.textures);

  await undo(page);
  const undone = await materials(page);
  expect(undone.floor.tint).toBeUndefined();
  expect(undone.canUndo).toBe(false);
});

test('a hex that is not a colour changes nothing and says so', async ({ page }) => {
  const panel = page.getByRole('region', { name: 'Room materials' });
  const before = await materials(page);
  const field = panel.getByRole('textbox', { name: 'Tint colour (hex)' });

  await field.fill('not a colour');
  await field.press('Enter');
  await expect(panel.getByRole('alert')).toHaveText('Use a colour like #aabbcc.');
  expect(await materials(page)).toEqual(before);

  await field.fill('#336699');
  await field.press('Enter');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect((await materials(page)).floor.tint).toBe('#336699');
});

test('on a short window the panel scrolls, so the last control is still reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  const metalness = page.getByRole('slider', { name: 'Metalness' });
  await metalness.scrollIntoViewIfNeeded();
  await expect(metalness).toBeInViewport();
});
