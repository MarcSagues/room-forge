import { expect, type Page, test } from '@playwright/test';

// Needs a catalog with sizes (the stub catalog of the catalog panel): without footprints an
// object can never end up outside the room.

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

function state(page: Page) {
  return page.evaluate(() => {
    const current = window.__RF__?.session.getState();
    const room = current ? Object.values(current.document.rooms)[0] : undefined;
    if (!room || !current) throw new Error('no room');
    return { width: room.shape.width, selection: [...current.selection] };
  });
}

test('shrinking the room around an object is refused, lists it, and can select it', async ({
  page,
}) => {
  await openEditor(page);
  await page.evaluate(() => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    const result = hook.session.execute(
      hook.commands.addObject({
        id: 'far',
        catalogId: 'bed.single',
        roomId,
        position: [3.4, 0, 2],
        rotationY: 0,
      }),
    );
    if (!result.ok) throw new Error(result.error.message);
  });
  const panel = page.getByRole('region', { name: 'Room size' });

  await panel.getByRole('textbox', { name: 'Width' }).fill('3');
  await panel.getByRole('button', { name: 'Apply size' }).click();

  await expect(panel.getByText('Not applied. These would end up outside the room:')).toBeVisible();
  await expect(panel.getByRole('listitem')).toHaveCount(1);
  expect(await state(page)).toMatchObject({ width: 4 });

  await panel.getByRole('button', { name: 'Show them' }).click();
  expect((await state(page)).selection).toEqual(['far']);

  await panel.getByRole('textbox', { name: 'Width' }).fill('4.5');
  await panel.getByRole('button', { name: 'Apply size' }).click();
  expect(await state(page)).toMatchObject({ width: 4.5 });
});
