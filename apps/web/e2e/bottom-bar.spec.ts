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

/** Adds a placeholder object at a room-local position of the 4 × 4.5 m demo room. */
async function addObject(page: Page, id: string, x: number, z: number) {
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

async function screenPoint(page: Page, id: string) {
  const point = await page.evaluate((target) => window.__RF__?.project(target as never), id);
  if (!point) throw new Error(`${id} is not on screen`);
  return point;
}

/** Where a floor position appears on screen: a throwaway marker is added, projected and removed. */
async function floorPoint(page: Page, x: number, z: number) {
  await addObject(page, 'marker', x, z);
  const point = await screenPoint(page, 'marker');
  await page.evaluate(() => window.__RF__?.session.undo());
  await settle(page);
  return point;
}

async function drag(page: Page, id: string, x: number, z: number) {
  const from = await screenPoint(page, id);
  const to = await floorPoint(page, x, z);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await settle(page);
  const moved = await page.evaluate(
    (target) => window.__RF__?.session.getState().document.objects[target as never]?.transform,
    id,
  );
  if (!moved) throw new Error(`${id} is gone`);
  return moved.position;
}

const bar = (page: Page) => page.getByRole('contentinfo');

test('the view buttons switch the camera, and show what the 1 and 2 keys chose', async ({
  page,
}) => {
  await openEditor(page);
  const view = bar(page).getByRole('group', { name: 'View' });
  await view.getByRole('button', { name: 'Top' }).click();
  await expect(view.getByRole('button', { name: 'Top' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__RF__?.session.getState().view)).toBe('top');
  await settle(page);

  await page.keyboard.press('Digit1');
  await expect(view.getByRole('button', { name: 'Perspective' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the grid size and snap on/off change how the next drag lands, at once', async ({ page }) => {
  await openEditor(page);
  await addObject(page, 'a', 1, 1.5);

  const snap = bar(page).getByRole('group', { name: 'Snap' });
  await snap.getByRole('button', { name: 'Grid size: 10 cm' }).click();
  await page.getByRole('menuitemradio', { name: '50 cm' }).click();
  await expect(snap.getByRole('button', { name: 'Grid size: 50 cm' })).toBeVisible();

  const onGrid = await drag(page, 'a', 2.37, 2.13);
  expect(onGrid[0] % 0.5).toBeCloseTo(0, 5);
  expect(onGrid[2] % 0.5).toBeCloseTo(0, 5);

  // G turns snap off: the object lands where it is dropped, not on the 50 cm grid.
  await page.keyboard.press('g');
  await expect(snap.getByRole('button', { name: 'Snap' })).toHaveAttribute('aria-pressed', 'false');
  const free = await drag(page, 'a', 1.23, 2.87);
  expect(Math.abs(free[0] - 1.23)).toBeLessThan(0.05);
  expect(Math.abs(free[2] - 2.87)).toBeLessThan(0.05);
});
