import { expect, type Page, test } from '@playwright/test';

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

async function addOpening(page: Page, id: string, variant: string, wall: WallId, offset = 1) {
  await page.evaluate(
    ({ id, variant, wall, offset }) => {
      const hook = window.__RF__;
      if (!hook) throw new Error('E2E hook missing');
      const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
      const result = hook.session.execute(
        hook.commands.addOpening({ id, roomId, wall, variant, offset }),
      );
      if (!result.ok) throw new Error(result.error.message);
    },
    { id, variant, wall, offset },
  );
  await settle(page);
}

/** Where the middle of an opening is on screen (its anchor is the bottom centre of the hole). */
async function openingPoint(page: Page, id: string) {
  const point = await page.evaluate((target) => {
    const hook = window.__RF__;
    const opening = hook?.session.getState().document.openings[target as never];
    if (!hook || !opening) return null;
    return hook.project(target as never, [0, opening.height / 2, 0]);
  }, id);
  if (!point) throw new Error(`${id} is not on screen`);
  return point;
}

const selection = (page: Page) =>
  page.evaluate(() => [...(window.__RF__?.session.getState().selection ?? [])]);
const openingIds = (page: Page) =>
  page.evaluate(() => Object.keys(window.__RF__?.session.getState().document.openings ?? {}));

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await settle(page);
});

test('a door and a window cut their wall and draw frame, leaf and glass', async ({ page }) => {
  const wall = await solidWall(page);
  const before = await info(page);
  await addOpening(page, 'door', 'door.single', wall, 0.3);
  const door = await info(page);
  await addOpening(page, 'window', 'window.large', wall, 1.6);
  const both = await info(page);
  if (!before || !door || !both) throw new Error('no renderer info');
  // A hole adds faces to the wall; the fittings are instanced: a few draw calls, not one per part.
  expect(door.triangles).toBeGreaterThan(before.triangles);
  expect(both.triangles).toBeGreaterThan(door.triangles);
  expect(both.calls - before.calls).toBeLessThanOrEqual(3);
  // Programs: the instanced variant of the standard material, compiled once.
  expect(both.programs - before.programs).toBeLessThanOrEqual(1);
  console.log('renderer.info', JSON.stringify({ before, door, both }));
});

test('clicking an opening selects it; Delete removes it and undo brings it back', async ({
  page,
}) => {
  const wall = await solidWall(page);
  await addOpening(page, 'window', 'window.standard', wall, 1);
  const point = await openingPoint(page, 'window');
  await page.mouse.click(point.x, point.y);
  expect(await selection(page)).toEqual(['window']);

  await page.keyboard.press('Delete');
  await expect.poll(() => openingIds(page)).not.toContain('window');
  await page.keyboard.press('Control+z');
  await expect.poll(() => openingIds(page)).toContain('window');
});
