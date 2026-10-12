import { expect, type Page, test } from '@playwright/test';

// P3-13: monitors stand on desks. The demo room is 4 × 4.5 m; the office desk is 1.4 × 0.7 m with
// its top at 0.74 m.

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

async function add(page: Page, id: string, catalogId: string, x: number, z: number) {
  await page.evaluate(
    ([objectId, item, px, pz]) => {
      const hook = window.__RF__;
      if (!hook) throw new Error('E2E hook missing');
      const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
      const result = hook.session.execute(
        hook.commands.addObject({
          id: objectId as string,
          catalogId: item as string,
          roomId,
          position: [px as number, 0, pz as number],
          rotationY: 0,
        }),
      );
      if (!result.ok) throw new Error(result.error.message);
    },
    [id, catalogId, x, z] as const,
  );
  await settle(page);
}

/** Screen point of a point in an object's own frame. */
async function screenPoint(page: Page, id: string, local: [number, number, number] = [0, 0.1, 0]) {
  const point = await page.evaluate(
    ([target, at]) => window.__RF__?.project(target as never, at as [number, number, number]),
    [id, local] as const,
  );
  if (!point) throw new Error(`${id} is not on screen`);
  return point;
}

/** Where a floor position appears on screen: a throwaway marker is added, projected and undone. */
async function floorPoint(page: Page, x: number, z: number) {
  await add(page, 'marker', 'test.box', x, z);
  const point = await screenPoint(page, 'marker');
  await page.evaluate(() => window.__RF__?.session.undo());
  await settle(page);
  return point;
}

const object = (page: Page, id: string) =>
  page.evaluate((target) => {
    const found = window.__RF__?.session.getState().document.objects[target as never];
    return found && { parentId: found.parentId, position: [...found.transform.position] };
  }, id);
const monitorId = (page: Page) =>
  page.evaluate(
    () =>
      Object.values(window.__RF__?.session.getState().document.objects ?? {}).find(
        (candidate) => candidate.catalogId === 'monitor.27.flat',
      )?.id ?? null,
  );
const undoLabel = (page: Page) =>
  page.evaluate(() => window.__RF__?.session.getState().history.undoLabel ?? null);

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await settle(page);
}

test('a monitor placed on a desk stands on it, moves with it, and can be taken off', async ({
  page,
}) => {
  await openEditor(page);
  await add(page, 'desk', 'desk.office.140', 2, 1.2);

  // From the catalog onto the middle of the desk top.
  const item = page
    .getByRole('list', { name: 'Catalog items' })
    .getByRole('button', { name: /Flat monitor 27 inch/ });
  await item.scrollIntoViewIfNeeded();
  const box = await item.boundingBox();
  if (!box) throw new Error('no catalog item');
  await drag(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    await screenPoint(page, 'desk', [0, 0.74, 0]),
  );
  const monitor = await monitorId(page);
  if (!monitor) throw new Error('no monitor was placed');
  const placed = await object(page, monitor);
  expect(placed?.parentId).toBe('desk');
  expect(placed?.position[1]).toBeCloseTo(0.74, 3);
  expect(Math.abs(placed?.position[0] ?? 9)).toBeLessThanOrEqual(0.7 - 0.305 + 0.001);
  expect(Math.abs(placed?.position[2] ?? 9)).toBeLessThanOrEqual(0.35 - 0.1 + 0.001);
  expect(await undoLabel(page)).toBe('Add object');

  // Dragging the desk by its front corner carries the monitor: one entry, the monitor untouched.
  await drag(
    page,
    await screenPoint(page, 'desk', [0.6, 0.6, 0.3]),
    await floorPoint(page, 2.6, 2.2),
  );
  const desk = await object(page, 'desk');
  expect(desk?.position[0]).toBeGreaterThan(2.2);
  expect(desk?.position[2]).toBeGreaterThan(1.7);
  expect(await object(page, monitor)).toEqual(placed);
  expect(await undoLabel(page)).toBe('Move object');

  // The monitor off the desk, onto the floor: one entry that re-parents it.
  await drag(page, await screenPoint(page, monitor, [0, 0.25, 0]), await floorPoint(page, 1, 3.6));
  const onFloor = await object(page, monitor);
  expect(onFloor?.parentId).toBeNull();
  expect(onFloor?.position[1]).toBe(0);
  expect(onFloor?.position[0]).toBeCloseTo(1, 0);
  expect(onFloor?.position[2]).toBeCloseTo(3.6, 0);
  expect(await undoLabel(page)).toBe('Move object');

  // One undo per gesture: back on the desk, then the desk back where it was.
  await page.evaluate(() => window.__RF__?.session.undo());
  expect(await object(page, monitor)).toEqual(placed);
  await page.evaluate(() => window.__RF__?.session.undo());
  expect((await object(page, 'desk'))?.position).toEqual([2, 0, 1.2]);
  expect(await object(page, monitor)).toEqual(placed);
  expect(await undoLabel(page)).toBe('Add object');
});
