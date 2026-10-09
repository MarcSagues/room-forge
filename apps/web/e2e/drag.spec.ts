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

/** Adds placeholder objects (room-local positions in the 4 × 4.5 m demo room). */
async function addObjects(page: Page, objects: { id: string; x: number; z: number }[]) {
  await page.evaluate((list) => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    for (const { id, x, z } of list) {
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
    }
  }, objects);
  await settle(page);
}

async function screenPoint(page: Page, id: string) {
  const point = await page.evaluate((target) => window.__RF__?.project(target as never), id);
  if (!point) throw new Error(`${id} is not on screen`);
  return point;
}

/** Where a floor position appears on screen: a throwaway marker is added, projected and removed. */
async function floorPoint(page: Page, x: number, z: number) {
  await addObjects(page, [{ id: 'marker', x, z }]);
  const point = await screenPoint(page, 'marker');
  await page.evaluate(() => {
    const hook = window.__RF__;
    hook?.session.undo();
  });
  await settle(page);
  return point;
}

const position = (page: Page, id: string) =>
  page.evaluate(
    (target) => window.__RF__?.session.getState().document.objects[target as never]?.transform,
    id,
  );
const history = (page: Page) =>
  page.evaluate(() => {
    const { canUndo, undoLabel } = window.__RF__?.session.getState().history ?? {};
    return { canUndo, undoLabel };
  });

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await addObjects(page, [{ id: 'a', x: 1, z: 1.5 }]);
});

test('dragging an object moves it with one history entry, and undo brings it back', async ({
  page,
}) => {
  const from = await screenPoint(page, 'a');
  const to = await floorPoint(page, 2.5, 3);
  const cameraBefore = await page.evaluate(() => window.__RF__?.camera.snapshot());

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  // Mid-gesture the object follows the pointer, but the document is untouched.
  expect((await position(page, 'a'))?.position).toEqual([1, 0, 1.5]);
  await page.mouse.up();
  await settle(page);

  const moved = (await position(page, 'a'))?.position;
  expect(moved?.[0]).toBeCloseTo(2.5, 0);
  expect(moved?.[2]).toBeCloseTo(3, 0);
  expect(await history(page)).toEqual({ canUndo: true, undoLabel: 'Move object' });
  expect(
    await page.evaluate(() => [...(window.__RF__?.session.getState().selection ?? [])]),
  ).toEqual(['a']);
  // The camera did not orbit while dragging.
  expect(await page.evaluate(() => window.__RF__?.camera.snapshot())).toEqual(cameraBefore);

  await page.evaluate(() => window.__RF__?.session.undo());
  expect((await position(page, 'a'))?.position).toEqual([1, 0, 1.5]);
  expect((await history(page)).undoLabel).toBe('Add object');
});

test('Esc during a drag puts the object back and records nothing', async ({ page }) => {
  const from = await screenPoint(page, 'a');
  const to = await floorPoint(page, 2.5, 3);
  const before = await history(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settle(page);

  expect((await position(page, 'a'))?.position).toEqual([1, 0, 1.5]);
  expect(await history(page)).toEqual(before);
  // The drag owned that Escape: the object stays selected.
  expect(
    await page.evaluate(() => [...(window.__RF__?.session.getState().selection ?? [])]),
  ).toEqual(['a']);
});

test('dragging past a wall snaps the object against it and turns it, in one entry', async ({
  page,
}) => {
  const from = await screenPoint(page, 'a');
  const to = await floorPoint(page, 0.05, 1.5);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await settle(page);

  const transform = await position(page, 'a');
  expect(transform?.rotationY).not.toBe(0);
  expect((transform?.position[0] ?? 9) < 0.5).toBe(true);
  expect(await history(page)).toEqual({ canUndo: true, undoLabel: 'Move object' });
});

test('arrow keys move the selected object one step, Shift ten, and undo returns it', async ({
  page,
}) => {
  const a = await screenPoint(page, 'a');
  await page.mouse.click(a.x, a.y);

  await page.keyboard.press('ArrowRight');
  expect((await position(page, 'a'))?.position[0]).toBeCloseTo(1.1);
  await page.keyboard.press('Shift+ArrowDown');
  const moved = (await position(page, 'a'))?.position;
  expect(moved?.[0]).toBeCloseTo(1.1);
  expect(moved?.[2]).toBeCloseTo(2.5);
  expect(await history(page)).toMatchObject({ canUndo: true, undoLabel: 'Move object' });

  // Whatever the history merged, undoing everything restores the start.
  await page.evaluate(() => {
    const session = window.__RF__?.session;
    while (session?.getState().history.undoLabel === 'Move object') session.undo();
  });
  expect((await position(page, 'a'))?.position).toEqual([1, 0, 1.5]);
});

test('a slow start does not orbit the camera before the drag begins', async ({ page }) => {
  const from = await screenPoint(page, 'a');
  const to = await floorPoint(page, 2.5, 3);
  const cameraBefore = await page.evaluate(() => window.__RF__?.camera.snapshot());

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // One pixel at a time: the press is still a possible click until it passes the click slop.
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(from.x + i, from.y + i / 2);
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await settle(page);

  expect(await page.evaluate(() => window.__RF__?.camera.snapshot())).toEqual(cameraBefore);
  expect((await position(page, 'a'))?.position[0]).toBeCloseTo(2.5, 0);
});

test('dragging among 50 objects renders at most one frame per pointer step and creates no resources', async ({
  page,
}) => {
  const crowd = Array.from({ length: 49 }, (_, i) => ({
    id: `o${i}`,
    x: 1.9 + (i % 5) * 0.4,
    z: 0.3 + Math.floor(i / 5) * 0.4,
  }));
  await addObjects(page, crowd);

  // Warm-up: a first drag selects 'a' and snaps it to a wall, which uploads the shared outline and
  // guide geometry once. The measured drag after it must not create anything.
  const start = await screenPoint(page, 'a');
  const wall = await floorPoint(page, 0.05, 1.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(wall.x, wall.y, { steps: 10 });
  await page.mouse.up();
  await settle(page);

  const from = await screenPoint(page, 'a');
  const to = await floorPoint(page, 1, 3.6);
  const info = () => page.evaluate(() => window.__RF__?.info());
  const idle = await info();

  const STEPS = 40;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: STEPS });
  const dragging = await info();
  await page.mouse.up();
  await settle(page);
  const dropped = await info();

  console.log(`RENDER 50 objects: ${JSON.stringify({ idle, dragging, dropped })}`);
  if (!idle || !dragging || !dropped) throw new Error('no render info');
  // The pointer is sampled once per animation frame, so a step costs at most one frame; the press
  // (pose published, camera locked) adds a few more, once.
  expect(dragging.frame - idle.frame).toBeLessThanOrEqual(STEPS + 5);
  expect(dragging.frame - idle.frame).toBeGreaterThan(0);
  // Only the outline (and maybe a wall guide) is added while dragging: no new geometry, texture
  // or shader program.
  for (const during of [dragging, dropped]) {
    expect(during.geometries).toBe(idle.geometries);
    expect(during.textures).toBe(idle.textures);
    expect(during.programs).toBe(idle.programs);
  }
  expect(dragging.calls - idle.calls).toBeLessThanOrEqual(2);
  expect((await position(page, 'a'))?.position[2]).toBeCloseTo(3.6, 0);
});
