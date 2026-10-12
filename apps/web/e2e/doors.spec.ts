import { expect, type Page, test } from '@playwright/test';

// P10-02: doors open and close with a double click, from the outliner and the properties panel;
// one history entry each, saved with the project, and no new shader programs.

type WallId = 'north' | 'east' | 'south' | 'west';

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const frame = (page: Page) => page.evaluate(() => window.__RF__?.info()?.frame ?? -1);
const info = (page: Page) => page.evaluate(() => window.__RF__?.info() ?? null);

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

/** A wall the camera sees from inside the room (not faded by the cutaway mode). */
async function solidWall(page: Page): Promise<WallId> {
  const wall = await page.evaluate(() => {
    const hook = window.__RF__;
    const roomId = Object.keys(hook?.session.getState().document.rooms ?? {})[0] as never;
    const shown = hook?.roomDisplay(roomId);
    const walls = ['north', 'west', 'east', 'south'] as const;
    return walls.find((w) => shown?.wallOpacity[w] === 1) ?? null;
  });
  if (!wall) throw new Error('every wall is faded');
  return wall;
}

async function addDoor(page: Page, wall: WallId) {
  await page.evaluate((wall) => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    const result = hook.session.execute(
      hook.commands.addOpening({ id: 'door', roomId, wall, variant: 'door.single', offset: 1 }),
    );
    if (!result.ok) throw new Error(result.error.message);
  }, wall);
  await settle(page);
}

const openValue = (page: Page) =>
  page.evaluate(
    () => window.__RF__?.session.getState().document.openings['door' as never]?.open ?? null,
  );

/** The instance matrices of the door leaves drawn on `wall`. */
const leaves = (page: Page, wall: WallId) =>
  page.evaluate((wall) => {
    const hook = window.__RF__;
    const roomId = Object.keys(hook?.session.getState().document.rooms ?? {})[0] as never;
    return hook?.roomDisplay(roomId)?.leaves[wall] ?? [];
  }, wall);

async function doorPoint(page: Page) {
  const point = await page.evaluate(() => window.__RF__?.project('door' as never, [0, 1, 0]));
  if (!point) throw new Error('the door is not on screen');
  return point;
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await settle(page);
});

test('a double click opens the door with a short swing; undo closes it; no new programs', async ({
  page,
}) => {
  const wall = await solidWall(page);
  await addDoor(page, wall);
  const closed = await leaves(page, wall);
  expect(closed).toHaveLength(16);
  const programs = (await info(page))?.programs;
  const historyBefore = await page.evaluate(() => window.__RF__?.session.getState().history);

  const point = await doorPoint(page);
  const start = await frame(page);
  await page.mouse.dblclick(point.x, point.y);
  expect(await openValue(page)).toBe(1);
  await settle(page);
  // The swing took several frames (an animation, not a jump), then the canvas went back to rest.
  expect((await frame(page)) - start).toBeGreaterThan(3);
  const open = await leaves(page, wall);
  expect(open).not.toEqual(closed);
  expect((await info(page))?.programs).toBe(programs);

  // One history entry: a single undo closes it (and the leaf swings back).
  await page.evaluate(() => window.__RF__?.session.undo());
  expect(await openValue(page)).toBe(0);
  expect(await page.evaluate(() => window.__RF__?.session.getState().history)).toMatchObject({
    undoLabel: historyBefore?.undoLabel,
    redoLabel: 'Open or close door',
  });
  await settle(page);
  const back = await leaves(page, wall);
  for (let i = 0; i < 16; i += 1) expect(back[i]).toBeCloseTo(closed[i] as number, 5);
});

test('an open door is saved with the project and drawn open after a reload', async ({ page }) => {
  const wall = await solidWall(page);
  await addDoor(page, wall);
  const point = await doorPoint(page);
  await page.mouse.dblclick(point.x, point.y);
  await settle(page);
  const open = await leaves(page, wall);
  await page.evaluate(() => window.__RF__?.autosave.flush());

  await page.reload();
  await page.waitForFunction(() => (window.__RF__?.info()?.frame ?? 0) >= 1);
  await settle(page);
  expect(await openValue(page)).toBe(1);
  // Drawn open at once, not swinging open on load.
  const reloaded = await leaves(page, wall);
  for (let i = 0; i < 16; i += 1) expect(reloaded[i]).toBeCloseTo(open[i] as number, 5);
});

test('the keyboard opens and closes it from the outliner and the properties panel', async ({
  page,
}) => {
  const wall = await solidWall(page);
  await addDoor(page, wall);
  const panel = page.getByRole('complementary', { name: 'Properties panel' });
  await panel.getByRole('tab', { name: 'Scene' }).click();
  const tree = panel.getByRole('tree', { name: 'Scene outline' });
  const row = tree.getByRole('treeitem', { name: new RegExp(`^Door, ${wall} wall`) });
  await row.focus();
  await page.keyboard.press('o');
  expect(await openValue(page)).toBe(1);
  await expect(panel.getByRole('status').filter({ hasText: 'opened' })).toHaveText(
    `Door, ${wall} wall opened`,
  );
  await page.keyboard.press('o');
  expect(await openValue(page)).toBe(0);

  // Selected, the door has its own section in the Properties tab.
  await page.keyboard.press('Enter');
  await panel.getByRole('tab', { name: 'Properties' }).click();
  const open = panel.getByRole('switch', { name: 'Open', exact: true });
  await open.focus();
  await page.keyboard.press('Space');
  expect(await openValue(page)).toBe(1);
  await expect(open).toBeChecked();
});
