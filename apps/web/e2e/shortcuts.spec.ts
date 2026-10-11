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

/** Adds a placeholder cube at a room-local position, then moves it: two history entries. */
async function addAndMove(page: Page) {
  await page.evaluate(() => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    hook.session.execute(
      hook.commands.addObject({
        id: 'a',
        catalogId: 'test.box',
        roomId,
        position: [1, 0, 1.5],
        rotationY: 0,
      }),
    );
  });
  await settle(page);
}

const state = (page: Page) =>
  page.evaluate(() => {
    const s = window.__RF__?.session.getState();
    return {
      objects: Object.keys(s?.document.objects ?? {}),
      selection: [...(s?.selection ?? [])],
      canUndo: s?.history.canUndo,
      canRedo: s?.history.canRedo,
      undoLabel: s?.history.undoLabel,
      view: s?.view,
    };
  });

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await addAndMove(page);
});

test('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, and the buttons follow the history', async ({
  page,
}) => {
  const undo = page.getByRole('button', { name: 'Undo: Add object' });
  await expect(undo).toBeEnabled();
  await undo.hover();
  await expect(page.getByRole('tooltip')).toContainText('Undo: Add object');
  await expect(page.getByRole('tooltip')).toContainText('Ctrl');
  await expect(page.getByRole('button', { name: 'Nothing to redo' })).toBeDisabled();

  await page.keyboard.press('Control+z');
  expect((await state(page)).objects).toEqual([]);
  await expect(page.getByRole('button', { name: 'Nothing to undo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Redo: Add object' })).toBeEnabled();

  await page.keyboard.press('Control+Shift+z');
  expect((await state(page)).objects).toEqual(['a']);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  expect((await state(page)).objects).toEqual(['a']);
});

test('the undo and redo buttons work with the mouse too', async ({ page }) => {
  await page.getByRole('button', { name: 'Undo: Add object' }).click();
  expect((await state(page)).objects).toEqual([]);
  await page.getByRole('button', { name: 'Redo: Add object' }).click();
  expect((await state(page)).objects).toEqual(['a']);
});

test('Delete removes the selection and Esc clears it', async ({ page }) => {
  await page.evaluate(() => window.__RF__?.session.select(['a' as never]));
  await page.keyboard.press('Escape');
  expect((await state(page)).selection).toEqual([]);

  await page.evaluate(() => window.__RF__?.session.select(['a' as never]));
  await page.keyboard.press('Delete');
  expect((await state(page)).objects).toEqual([]);
  expect((await state(page)).undoLabel).toBe('Delete object');
});

test('the view shortcuts still work: 2 for the top view, 1 for perspective', async ({ page }) => {
  await page.keyboard.press('2');
  expect((await state(page)).view).toBe('top');
  await page.keyboard.press('1');
  expect((await state(page)).view).toBe('perspective');
});

test('? opens the shortcuts dialog with every registered shortcut, and Esc closes it', async ({
  page,
}) => {
  await page.keyboard.press('Shift+?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  // Thirteen of the editor (raise and lower too), the two panels, the help itself and the
  // Shift + drag gesture.
  await expect(dialog.getByRole('listitem')).toHaveCount(17);
  await expect(dialog.getByText('Turn snap on or off')).toBeVisible();
  await expect(dialog.getByText('Undo', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Show or hide the catalog panel')).toBeVisible();
  await expect(dialog.getByText('Show the keyboard shortcuts')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('while the dialog is open the other shortcuts stay quiet', async ({ page }) => {
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('2');
  await page.keyboard.press('Control+z');
  const after = await state(page);
  expect(after.view).toBe('perspective');
  expect(after.objects).toEqual(['a']);
});
