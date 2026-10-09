import { createRequire } from 'node:module';
import { expect, type Page, test } from '@playwright/test';

// axe is injected as a script tag: the page's CSP would refuse it.
test.use({ bypassCSP: true });

const require = createRequire(import.meta.url);

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const info = (page: Page) => page.evaluate(() => window.__RF__?.info());

async function settle(page: Page) {
  let previous = (await info(page))?.frame ?? -1;
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(150);
    const now = (await info(page))?.frame ?? -1;
    if (now === previous) return;
    previous = now;
  }
  throw new Error('the canvas never went idle');
}

/** Two named placeholder cubes (0.5 m) in the 4 × 4.5 m demo room. */
async function addCubes(page: Page) {
  await page.evaluate(() => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    for (const [id, name, x] of [
      ['a', 'Cube A', 1],
      ['b', 'Cube B', 3],
    ] as const) {
      const result = hook.session.execute(
        hook.commands.addObject({
          id,
          name,
          catalogId: 'test.box',
          roomId,
          position: [x, 0, 1.5],
          rotationY: 0,
        }),
      );
      if (!result.ok) throw new Error(result.error.message);
    }
  });
  await settle(page);
}

const object = (page: Page, id: string) =>
  page.evaluate((target) => {
    const state = window.__RF__?.session.getState();
    const found = state?.document.objects[target as never];
    return { hidden: found?.hidden, locked: found?.locked, selection: state?.selection };
  }, id);

const panel = (page: Page) => page.getByRole('complementary', { name: 'Properties panel' });
const tree = (page: Page) => panel(page).getByRole('tree', { name: 'Scene outline' });
const row = (page: Page, name: string) => tree(page).getByRole('treeitem', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await addCubes(page);
  await panel(page).getByRole('tab', { name: 'Scene' }).click();
});

test('selects, hides and locks from the keyboard; the viewport follows and undo restores', async ({
  page,
}) => {
  // Keyboard only from here: into the tree, down to Cube A, select it.
  await row(page, 'Cube A').waitFor();
  await tree(page).getByRole('treeitem').first().focus();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(row(page, 'Cube A')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row(page, 'Cube A')).toHaveAttribute('aria-selected', 'true');
  expect((await object(page, 'a')).selection).toEqual(['a']);
  await expect(panel(page).getByRole('status')).toHaveText('Cube A selected');

  // Hiding it takes it out of the picture: fewer triangles drawn.
  await settle(page);
  const before = await info(page);
  await page.keyboard.press('h');
  await settle(page);
  expect((await object(page, 'a')).hidden).toBe(true);
  await expect(row(page, 'Cube A hidden')).toBeVisible();
  const hidden = await info(page);
  expect(hidden?.triangles).toBeLessThan(before?.triangles ?? 0);

  await page.keyboard.press('l');
  expect((await object(page, 'a')).locked).toBe(true);

  // Ctrl+Z still reaches the editor from the tree: lock, then hide, come undone.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await settle(page);
  expect(await object(page, 'a')).toMatchObject({ hidden: false, locked: false });
  expect((await info(page))?.triangles).toBe(before?.triangles);
});

test('a selection made in the viewport shows in the tree', async ({ page }) => {
  await row(page, 'Cube B').waitFor();
  await page.evaluate(() => window.__RF__?.session.select(['b' as never]));
  await expect(row(page, 'Cube B')).toHaveAttribute('aria-selected', 'true');
  await expect(row(page, 'Cube B')).toHaveAttribute('tabindex', '0');
});

test('the outliner has no serious accessibility violations (axe)', async ({ page }) => {
  await row(page, 'Cube A').click();
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
    const results = await axe.run('[aria-label="Properties panel"]');
    return results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  });
  expect(violations).toEqual([]);
});
