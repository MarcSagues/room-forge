import { expect, test } from '@playwright/test';

test('a project made with a chosen room size opens in the editor with that room, centred and framed', async ({
  page,
}) => {
  await page.goto('/projects/');
  await expect(page.getByText('No projects yet')).toBeVisible();

  await page.getByRole('button', { name: 'Custom room size…' }).last().click();
  const dialog = page.getByRole('dialog', { name: 'New room' });
  await expect(dialog).toBeVisible();

  // The plan follows what is typed; a value outside the limits cannot be confirmed.
  await dialog.getByRole('textbox', { name: 'Width' }).fill('5');
  await dialog.getByRole('textbox', { name: 'Depth' }).fill('3.5');
  await dialog.getByRole('textbox', { name: 'Height' }).fill('5');
  await expect(dialog.getByRole('button', { name: 'Create project' })).toBeDisabled();
  await expect(dialog.getByText('At most 4 m.')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Height' }).fill('2.8');
  await expect(dialog.getByRole('img', { name: 'Plan of a room 5 by 3.5 m' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await expect(dialog).toBeHidden();
  await page.getByRole('link', { name: 'Open Untitled project' }).click();
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );

  const room = await page.evaluate(() => {
    const state = window.__RF__?.session.getState();
    const found = state ? Object.values(state.document.rooms)[0] : undefined;
    if (!found) throw new Error('no room');
    return { shape: found.shape, height: found.height, origin: found.origin };
  });
  expect(room.shape).toMatchObject({ width: 5, depth: 3.5 });
  expect(room.height).toBe(2.8);
  expect(room.origin).toEqual([-2.5, -1.75]);

  // Framed: the camera looks at the middle of the room, not at some corner.
  const camera = await page.evaluate(() => window.__RF__?.camera.snapshot());
  expect(camera?.target[0]).toBeCloseTo(0, 0);
  expect(camera?.target[2]).toBeCloseTo(0, 0);
  expect(camera?.target[1]).toBeGreaterThan(0.5);
  expect(camera?.target[1]).toBeLessThan(2.8);
});

test('a preset creates the room it names', async ({ page }) => {
  await page.goto('/projects/');
  await page.getByRole('button', { name: 'Custom room size…' }).last().click();
  const dialog = page.getByRole('dialog', { name: 'New room' });
  await dialog.getByRole('button', { name: /^Small/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Open Untitled project' }).click();
  await page.waitForFunction(() => window.__RF__?.session != null);
  const shape = await page.evaluate(() => {
    const state = window.__RF__?.session.getState();
    return state ? Object.values(state.document.rooms)[0]?.shape : undefined;
  });
  expect(shape).toMatchObject({ width: 3, depth: 3 });
});
