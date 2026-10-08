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

const selection = (page: Page) =>
  page.evaluate(() => [...(window.__RF__?.session.getState().selection ?? [])]);
const hover = (page: Page) => page.evaluate(() => window.__RF__?.session.getState().hover ?? null);

const OBJECTS = [
  { id: 'a', x: 1, z: 1.5 },
  { id: 'b', x: 2, z: 2.25 },
  { id: 'c', x: 3, z: 3 },
];

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await addObjects(page, OBJECTS);
});

test('clicking an object selects it and shows it in the properties panel; Esc clears', async ({
  page,
}) => {
  const b = await screenPoint(page, 'b');
  await page.mouse.click(b.x, b.y);
  expect(await selection(page)).toEqual(['b']);
  const panel = page.getByRole('complementary', { name: 'Properties panel' });
  await expect(panel.getByRole('heading', { name: 'Unnamed object' })).toBeVisible();
  await expect(panel.getByText('test.box')).toBeVisible();

  await page.keyboard.press('Escape');
  expect(await selection(page)).toEqual([]);
  await expect(panel.getByText('Select an object to edit its properties.')).toBeVisible();
});

test('clicking empty space deselects; Shift+click adds to the selection', async ({ page }) => {
  const a = await screenPoint(page, 'a');
  const c = await screenPoint(page, 'c');
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.up('Shift');
  expect(await selection(page)).toEqual(['a', 'c']);

  const box = await page.locator('main canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + 5, box.y + 5);
  expect(await selection(page)).toEqual([]);
});

test('hover follows the pointer and costs no frames while it stays on the same object', async ({
  page,
}) => {
  const b = await screenPoint(page, 'b');
  await page.mouse.move(b.x, b.y);
  await page.waitForFunction(() => window.__RF__?.session.getState().hover === 'b');
  await settle(page);

  const before = await frame(page);
  for (let i = 1; i <= 5; i += 1) await page.mouse.move(b.x + i, b.y + i);
  await page.waitForTimeout(300);
  expect(await frame(page)).toBe(before);
  expect(await hover(page)).toBe('b');

  const box = await page.locator('main canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.waitForFunction(() => window.__RF__?.session.getState().hover === null);
});

test('hidden and locked objects cannot be selected', async ({ page }) => {
  const a = await screenPoint(page, 'a');
  const b = await screenPoint(page, 'b');
  await page.evaluate(() => {
    const hook = window.__RF__;
    const state = hook?.session;
    if (!state) throw new Error('E2E hook missing');
    // setObjectProps is not on the hook: flip the flags through a tiny command.
    state.execute({
      type: 'test/flags',
      label: 'flags',
      apply(draft) {
        const objects = draft.objects as Record<string, { hidden: boolean; locked: boolean }>;
        if (objects.a) objects.a.hidden = true;
        if (objects.b) objects.b.locked = true;
      },
    });
  });
  await settle(page);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  expect(await selection(page)).toEqual([]);
});

test('deleting the selected object clears the selection and the panel', async ({ page }) => {
  const c = await screenPoint(page, 'c');
  await page.mouse.click(c.x, c.y);
  expect(await selection(page)).toEqual(['c']);
  await page.evaluate(() => {
    const hook = window.__RF__;
    hook?.session.execute(hook.commands.removeObjects(['c' as never]));
  });
  expect(await selection(page)).toEqual([]);
  await expect(
    page
      .getByRole('complementary', { name: 'Properties panel' })
      .getByText('Select an object to edit its properties.'),
  ).toBeVisible();
});
