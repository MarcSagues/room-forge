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

const point = async (page: Page, id: string) => {
  const p = await page.evaluate((target) => window.__RF__?.project(target as never), id);
  if (!p) throw new Error(`${id} is not on screen`);
  return p;
};

const transform = (page: Page, id: string) =>
  page.evaluate(
    (target) => window.__RF__?.session.getState().document.objects[target as never]?.transform,
    id,
  );
const history = (page: Page) =>
  page.evaluate(() => {
    const { canUndo, undoLabel } = window.__RF__?.session.getState().history ?? {};
    return { canUndo, undoLabel };
  });

const panel = (page: Page) => page.getByRole('complementary', { name: 'Properties panel' });
const field = (page: Page, name: string) => panel(page).getByRole('spinbutton', { name });

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await addObjects(page, [{ id: 'a', x: 1, z: 1.5 }]);
  const a = await point(page, 'a');
  await page.mouse.click(a.x, a.y);
});

test('shows the selected object in centimetres, with its size and switches', async ({ page }) => {
  await expect(panel(page).getByRole('heading', { name: 'Unnamed object' })).toBeVisible();
  await expect(field(page, 'X')).toHaveValue('100');
  await expect(field(page, 'Z')).toHaveValue('150');
  await expect(field(page, 'Rotation')).toHaveValue('0');
  await expect(panel(page).getByRole('switch', { name: 'Visible' })).toBeChecked();
});

test('changing X from the panel moves the object; undo brings it back', async ({ page }) => {
  await field(page, 'X').fill('220');
  await field(page, 'X').press('Enter');
  await settle(page);
  expect((await transform(page, 'a'))?.position[0]).toBeCloseTo(2.2);
  expect(await history(page)).toMatchObject({ canUndo: true, undoLabel: 'Move object' });

  await page.evaluate(() => window.__RF__?.session.undo());
  await expect(field(page, 'X')).toHaveValue('100');
  expect((await transform(page, 'a'))?.position[0]).toBeCloseTo(1);
});

test('arrow keys in a field nudge the value, all as one history entry', async ({ page }) => {
  await field(page, 'Z').focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(field(page, 'Z')).toHaveValue('145');
  await settle(page);
  await page.evaluate(() => window.__RF__?.session.undo());
  expect((await transform(page, 'a'))?.position[2]).toBeCloseTo(1.5);
  // One undo took all the nudges back: only the object's creation is left.
  expect((await history(page)).undoLabel).toBe('Add object');
});

test('a name that is too long is refused with an accessible message', async ({ page }) => {
  // (A position outside the room is refused too, but only for catalog items: see the unit tests.)
  const name = panel(page).getByRole('textbox', { name: 'Name' });
  await name.fill('x'.repeat(81));
  await name.press('Enter');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(panel(page).getByRole('alert')).toHaveText('The name is too long');
  expect((await history(page)).undoLabel).toBe('Add object');

  await name.press('Escape');
  await expect(name).toHaveValue('');
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
});

test('while an object is dragged in the scene the fields follow it, then show the final value', async ({
  page,
}) => {
  const from = await point(page, 'a');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 120, from.y + 40, { steps: 10 });
  await page.waitForTimeout(300);
  // Mid-drag the document has not changed, but the panel already shows where the object is.
  expect((await transform(page, 'a'))?.position[0]).toBeCloseTo(1);
  const live = Number(await field(page, 'X').inputValue());
  expect(live).not.toBe(100);
  await page.mouse.up();
  await settle(page);

  const finalX = (await transform(page, 'a'))?.position[0] ?? 0;
  await expect(field(page, 'X')).toHaveValue(String(Math.round(finalX * 1000) / 10));
  expect(Math.abs(live - finalX * 100)).toBeLessThan(12); // the live value was the snapped one
});

test('the name, lock and visibility can be edited, and the object can be duplicated and deleted', async ({
  page,
}) => {
  await panel(page).getByRole('textbox', { name: 'Name' }).fill('Side table');
  await page.keyboard.press('Enter');
  await expect(panel(page).getByRole('heading', { name: 'Side table' })).toBeVisible();

  await panel(page).getByRole('switch', { name: 'Locked' }).click();
  expect(
    await page.evaluate(
      () => window.__RF__?.session.getState().document.objects['a' as never]?.locked,
    ),
  ).toBe(true);

  await panel(page).getByRole('button', { name: 'Duplicate' }).click();
  expect(
    await page.evaluate(
      () => Object.keys(window.__RF__?.session.getState().document.objects ?? {}).length,
    ),
  ).toBe(2);
  await panel(page).getByRole('button', { name: 'Delete' }).click();
  expect(
    await page.evaluate(
      () => Object.keys(window.__RF__?.session.getState().document.objects ?? {}).length,
    ),
  ).toBe(1);
  await expect(panel(page).getByText('Select an object to edit its properties.')).toBeVisible();
});
