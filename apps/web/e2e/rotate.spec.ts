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

/** Adds placeholder cubes (0.5 m) at room-local positions in the 4 × 4.5 m demo room. */
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

async function screenPoint(page: Page, id: string, local?: [number, number, number]) {
  const point = await page.evaluate(
    ([target, offset]) => window.__RF__?.project(target as never, offset ?? undefined),
    [id, local ?? null] as const,
  );
  if (!point) throw new Error(`${id} is not on screen`);
  return point;
}

// The rotation handle of a 0.5 m cube: a ring of this radius, with the knob in front (+z).
const RING = Math.hypot(0.5, 0.5) / 2 + 0.2;
const knobOf = (page: Page, id: string) => screenPoint(page, id, [0, 0.02, RING]);
const sideOf = (page: Page, id: string) => screenPoint(page, id, [RING, 0.02, 0]);

const transform = (page: Page, id: string) =>
  page.evaluate(
    (target) => window.__RF__?.session.getState().document.objects[target as never]?.transform,
    id,
  );
const rotation = async (page: Page, id: string) => (await transform(page, id))?.rotationY ?? 0;
const history = (page: Page) =>
  page.evaluate(() => {
    const { canUndo, undoLabel } = window.__RF__?.session.getState().history ?? {};
    return { canUndo, undoLabel };
  });
const selection = (page: Page) =>
  page.evaluate(() => [...(window.__RF__?.session.getState().selection ?? [])]);

async function select(page: Page, id: string) {
  const point = await screenPoint(page, id);
  await page.mouse.click(point.x, point.y);
}

/** Undoes every history entry of the given label from the top. */
const undoAll = (page: Page, label: string) =>
  page.evaluate((target) => {
    const session = window.__RF__?.session;
    while (session?.getState().history.undoLabel === target) session.undo();
  }, label);

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await addObjects(page, [{ id: 'a', x: 2, z: 2.25 }]);
});

test('R and Shift+R turn the selected object; 24 presses return it; undo restores', async ({
  page,
}) => {
  await select(page, 'a');
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('r');
  expect(await rotation(page, 'a')).toBeCloseTo(Math.PI / 2);
  await page.keyboard.press('Shift+R');
  await page.keyboard.press('Shift+R');
  expect(await rotation(page, 'a')).toBeCloseTo(Math.PI / 2 - Math.PI / 6);

  await undoAll(page, 'Rotate object');
  expect(await rotation(page, 'a')).toBe(0);

  for (let i = 0; i < 24; i += 1) await page.keyboard.press('r');
  const full = await rotation(page, 'a');
  expect(Math.cos(full)).toBeCloseTo(1, 6);
  expect(Math.sin(full)).toBeCloseTo(0, 6);
});

test('turning next to a wall pushes the object in so it stays inside the room', async ({
  page,
}) => {
  await addObjects(page, [{ id: 'w', x: 0.25, z: 1 }]); // flush against the west wall
  await select(page, 'w');
  await page.keyboard.press('r'); // 15°: the footprint is wider along x
  const turned = await transform(page, 'w');
  const halfExtent = (0.5 * (Math.cos(Math.PI / 12) + Math.sin(Math.PI / 12))) / 2;
  expect(turned?.position[0] ?? 0).toBeGreaterThanOrEqual(halfExtent - 1e-6);
  expect(turned?.rotationY).toBeCloseTo(Math.PI / 12);
});

test('dragging the knob of the handle turns the object: one entry, with the angle shown', async ({
  page,
}) => {
  await select(page, 'a');
  const knob = await knobOf(page, 'a');
  const side = await sideOf(page, 'a');
  const cameraBefore = await page.evaluate(() => window.__RF__?.camera.snapshot());

  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  await page.mouse.move(side.x, side.y, { steps: 12 });
  await expect(page.getByText('90°')).toBeVisible();
  // Mid-gesture the document is untouched.
  expect(await rotation(page, 'a')).toBe(0);
  await page.mouse.up();
  await settle(page);

  expect(await rotation(page, 'a')).toBeCloseTo(Math.PI / 2);
  expect(await history(page)).toEqual({ canUndo: true, undoLabel: 'Rotate object' });
  await expect(page.getByText('90°')).toBeHidden();
  expect(await page.evaluate(() => window.__RF__?.camera.snapshot())).toEqual(cameraBefore);

  await page.evaluate(() => window.__RF__?.session.undo());
  expect(await rotation(page, 'a')).toBe(0);
});

test('Esc during a handle drag puts the object back and records nothing', async ({ page }) => {
  await select(page, 'a');
  const knob = await knobOf(page, 'a');
  const side = await sideOf(page, 'a');
  const before = await history(page);

  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  await page.mouse.move(side.x, side.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settle(page);

  expect(await rotation(page, 'a')).toBe(0);
  expect(await history(page)).toEqual(before);
  expect(await selection(page)).toEqual(['a']);
});

test('the wheel and R turn an object while it is being dragged, in the same entry', async ({
  page,
}) => {
  const from = await screenPoint(page, 'a');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 10, { steps: 6 });
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await page.keyboard.press('r');
  await settle(page);
  await page.mouse.up();
  await settle(page);

  expect(await rotation(page, 'a')).toBeCloseTo((3 * Math.PI) / 12);
  expect(await history(page)).toEqual({ canUndo: true, undoLabel: 'Move object' });
  await page.evaluate(() => window.__RF__?.session.undo());
  const back = await transform(page, 'a');
  expect(back?.rotationY).toBe(0);
  expect(back?.position).toEqual([2, 0, 2.25]);
});
