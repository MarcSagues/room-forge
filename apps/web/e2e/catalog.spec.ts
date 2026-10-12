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

/** Where a floor position (room-local metres) appears on screen: a marker is added, projected, undone. */
async function floorPoint(page: Page, x: number, z: number) {
  await page.evaluate(
    ([px, pz]) => {
      const hook = window.__RF__;
      if (!hook) throw new Error('E2E hook missing');
      const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
      const result = hook.session.execute(
        hook.commands.addObject({
          id: 'marker',
          catalogId: 'test.box',
          roomId,
          position: [px as number, 0, pz as number],
          rotationY: 0,
        }),
      );
      if (!result.ok) throw new Error(result.error.message);
    },
    [x, z],
  );
  await settle(page);
  const point = await page.evaluate(() => window.__RF__?.project('marker' as never));
  await page.evaluate(() => window.__RF__?.session.undo());
  await settle(page);
  if (!point) throw new Error('the marker is not on screen');
  return point;
}

/** A card, by the start of its name (each card also has a "Favorite: <name>" star). */
const catalogItem = (page: Page, name: RegExp) =>
  page
    .getByRole('list', { name: 'Catalog items' })
    .getByRole('button', { name: new RegExp(`^${name.source}`) });

async function center(locator: ReturnType<typeof catalogItem>) {
  // The list is longer than the panel: bring the item into view, as a user would scroll to it.
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('item is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const objects = (page: Page) =>
  page.evaluate(() =>
    Object.values(window.__RF__?.session.getState().document.objects ?? {}).map((object) => ({
      id: object.id as string,
      catalogId: object.catalogId,
      position: [...object.transform.position],
      rotationY: object.transform.rotationY,
    })),
  );
const history = (page: Page) =>
  page.evaluate(() => {
    const { canUndo, undoLabel } = window.__RF__?.session.getState().history ?? {};
    return { canUndo, undoLabel };
  });
const calls = (page: Page) => page.evaluate(() => window.__RF__?.info()?.calls ?? -1);
const selection = (page: Page) =>
  page.evaluate(() => [...(window.__RF__?.session.getState().selection ?? [])]);

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test('the panel lists the fifteen models and the five stub items, and filters them as you type', async ({
  page,
}) => {
  const list = page.getByRole('list', { name: 'Catalog items' });
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await expect(catalogItem(page, /Office desk 140/)).toContainText('140 × 70 cm');
  await expect(catalogItem(page, /Desk/)).toContainText('140 × 70 cm');

  await page.getByRole('searchbox', { name: 'Search the catalog' }).fill('office chair');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(catalogItem(page, /Office chair/)).toBeVisible();

  await page.getByRole('searchbox').fill('zzz');
  await expect(page.getByText('No items match "zzz".')).toBeVisible();
});

test('dragging an item over the floor shows a ghost; dropping creates it where the ghost is', async ({
  page,
}) => {
  const target = await floorPoint(page, 2.03, 2.31);
  const start = await center(catalogItem(page, /Desk/));
  const idle = await calls(page);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 14 });
  await settle(page);
  expect(await calls(page)).toBe(idle + 2); // the ghost: fill and edges
  expect(await objects(page)).toHaveLength(0); // nothing in the document yet
  await page.mouse.up();
  await settle(page);

  const created = await objects(page);
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ catalogId: 'desk.basic.140' });
  expect(created[0]?.position[0]).toBeCloseTo(2.03, 0);
  expect(created[0]?.position[2]).toBeCloseTo(2.31, 0);
  expect(await history(page)).toEqual({ canUndo: true, undoLabel: 'Add object' });
  expect(await selection(page)).toEqual([created[0]?.id]);
  await expect(page.getByText('Desk placed.')).toBeAttached();

  await page.evaluate(() => window.__RF__?.session.undo());
  expect(await objects(page)).toHaveLength(0);
});

test('dropping over a panel, or beside the room, creates nothing', async ({ page }) => {
  const start = await center(catalogItem(page, /Desk/));
  const canvas = await page.locator('main canvas').boundingBox();
  if (!canvas) throw new Error('no canvas');

  // Released over the properties panel.
  const panel = await page.getByRole('complementary', { name: 'Properties panel' }).boundingBox();
  if (!panel) throw new Error('no properties panel');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 8 });
  await page.mouse.move(panel.x + 40, panel.y + 120, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  expect(await objects(page)).toHaveLength(0);
  await expect(page.getByText('Desk could not be placed.')).toBeAttached();

  // Released in the viewport but away from any floor (the top-left corner is empty space).
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 6, canvas.y + 6, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  expect(await objects(page)).toHaveLength(0);
  expect(await history(page)).toMatchObject({ canUndo: false });
});

test('Esc during the drag cancels it and the ghost goes away', async ({ page }) => {
  const target = await floorPoint(page, 2, 2.25);
  const start = await center(catalogItem(page, /Single bed/));
  const idle = await calls(page);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await settle(page);
  expect(await calls(page)).toBe(idle + 2); // the ghost
  await page.keyboard.press('Escape');
  await settle(page);
  expect(await calls(page)).toBe(idle);
  await page.mouse.up();
  await settle(page);
  expect(await objects(page)).toHaveLength(0);
});

test('Enter on an item places it in the middle of the view; a click does too', async ({ page }) => {
  await catalogItem(page, /Office chair/).focus();
  await page.keyboard.press('Enter');
  await settle(page);
  const [chair] = await objects(page);
  expect(chair).toMatchObject({ catalogId: 'chair.office' });
  // Where the centre of the view meets the floor, inside the demo room (4 × 4.5 m).
  expect(chair?.position[0] ?? 9).toBeGreaterThanOrEqual(0.3);
  expect(chair?.position[0] ?? 9).toBeLessThanOrEqual(3.7);
  expect(chair?.position[2] ?? 9).toBeGreaterThanOrEqual(0.3);
  expect(chair?.position[2] ?? 9).toBeLessThanOrEqual(4.2);
  expect(await history(page)).toEqual({ canUndo: true, undoLabel: 'Add object' });
  await expect(page.getByText('Office chair placed.')).toBeAttached();

  await catalogItem(page, /Bookshelf/).click();
  await settle(page);
  expect(await objects(page)).toHaveLength(2);
});
