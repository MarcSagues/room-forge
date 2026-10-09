import { expect, type Page, test } from '@playwright/test';

async function openEditor(page: Page, path = '/editor/') {
  await page.goto(path);
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

/** Adds a box; returns why the session refused it, or `null` if it was added. */
const tryAddObject = (page: Page, id: string, x = 2) =>
  page.evaluate(
    ({ id, x }) => {
      const hook = window.__RF__;
      if (!hook) throw new Error('E2E hook missing');
      const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
      const result = hook.session.execute(
        hook.commands.addObject({
          id,
          catalogId: 'test.box',
          roomId,
          position: [x, 0, 2],
          rotationY: 0,
        }),
      );
      return result.ok ? null : result.error.code;
    },
    { id, x },
  );

const objectIds = (page: Page) =>
  page.evaluate(() => Object.keys(window.__RF__?.session.getState().document.objects ?? {}));

const notice = (page: Page) =>
  page.getByRole('status', { name: 'This project is open in another tab.' });

test('the same project in a second tab opens read-only, and taking over swaps the tabs', async ({
  context,
}) => {
  const first = await context.newPage();
  await openEditor(first);
  expect(await tryAddObject(first, 'desk')).toBeNull();

  // The second tab opens the last project, the one the first tab is editing.
  const second = await context.newPage();
  await openEditor(second);
  await expect(notice(second)).toBeVisible();
  await expect(notice(first)).toBeHidden();
  expect(await tryAddObject(second, 'chair', 1)).toBe('read-only');
  expect(await second.evaluate(() => window.__RF__?.autosave.state() ?? null)).toBeNull();

  // A change the first tab has not saved yet still reaches the second one: it is written first.
  expect(await tryAddObject(first, 'lamp', 1)).toBeNull();
  await second.getByRole('button', { name: 'Take over' }).click();
  await second.waitForURL(/[?&]project=/);
  await second.waitForFunction(() => window.__RF__?.autosave.state()?.status === 'saved');

  await expect(notice(second)).toBeHidden();
  expect((await objectIds(second)).sort()).toEqual(['desk', 'lamp']);
  expect(await tryAddObject(second, 'chair', 3)).toBeNull();

  await expect(notice(first)).toBeVisible();
  expect(await tryAddObject(first, 'shelf', 3)).toBe('read-only');
});
