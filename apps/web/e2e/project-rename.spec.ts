import { expect, type Page, test } from '@playwright/test';

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const banner = (page: Page) => page.getByRole('banner');

test('the project is renamed from the top bar, and keeps the name after a reload', async ({
  page,
}) => {
  await openEditor(page);
  await banner(page).getByRole('button', { name: 'Rename project: Untitled project' }).click();
  const field = banner(page).getByRole('textbox', { name: 'Project name' });
  await expect(field).toBeFocused();
  await page.keyboard.type('Gaming room');
  await page.keyboard.press('Enter');
  await expect(
    banner(page).getByRole('button', { name: 'Rename project: Gaming room' }),
  ).toBeFocused();

  // An edit after the rename is saved under the new name, not the old one.
  await page.evaluate(() => window.__RF__?.session.setView('top'));
  await page.reload();
  await page.waitForFunction(() => window.__RF__?.session != null);
  await expect(
    banner(page).getByRole('button', { name: 'Rename project: Gaming room' }),
  ).toBeVisible();

  await page.goto('/projects/');
  await expect(page.getByRole('heading', { level: 2, name: 'Gaming room' })).toBeVisible();
});

test('Esc cancels a rename, and an empty name is not accepted', async ({ page }) => {
  await openEditor(page);
  const name = banner(page).getByRole('button', { name: 'Rename project: Untitled project' });
  await name.click();
  await page.keyboard.type('Something else');
  await page.keyboard.press('Escape');
  await expect(name).toBeFocused();

  await name.click();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  await expect(banner(page).getByRole('alert')).toHaveText('Enter a name.');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForFunction(() => window.__RF__?.session != null);
  await expect(
    banner(page).getByRole('button', { name: 'Rename project: Untitled project' }),
  ).toBeVisible();
});
