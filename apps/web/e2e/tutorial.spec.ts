import { expect, type Page, test } from '@playwright/test';

// A first visit: nothing in storage but the storage toasts, which are not under test here.
test.use({ storageState: { cookies: [], origins: [] } });

async function openEditor(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('roomforge.storageWarningShown', '1');
    localStorage.setItem('roomforge.backupReminder', '{"edits":0,"since":null,"never":true}');
  });
  await page.goto('/editor/');
  await page.waitForFunction(() => (window.__RF__?.info()?.frame ?? 0) >= 1);
}

const TITLES = [
  'Add furniture',
  'Move and turn',
  'View and snap',
  'Colours and materials',
  'Light it up',
  'Save, export, share',
];

test('the tour opens on the first visit, walks every step and is not shown again', async ({
  page,
}) => {
  await openEditor(page);
  const tour = page.getByRole('dialog', { name: 'Add furniture' });
  await expect(tour).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add furniture' })).toBeFocused();
  // Not modal: the editor stays usable behind it.
  await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeEnabled();

  for (const [index, title] of TITLES.entries()) {
    const card = page.getByRole('dialog', { name: title });
    await expect(card).toBeVisible();
    await expect(card.getByText(`Step ${index + 1} of ${TITLES.length}`)).toBeVisible();
    await card.getByRole('button', { name: index === TITLES.length - 1 ? 'Done' : 'Next' }).click();
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await page.waitForFunction(() => (window.__RF__?.info()?.frame ?? 0) >= 1);
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Escape skips the tour, and the top bar opens it again', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByRole('dialog', { name: 'Add furniture' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('roomforge.tutorialSeen'))).toBe('1');

  const button = page.getByRole('button', { name: 'Take the tour' });
  await button.click();
  const tour = page.getByRole('dialog', { name: 'Add furniture' });
  await expect(tour).toBeVisible();
  await tour.getByRole('button', { name: 'Skip the tour' }).click();
  await expect(tour).toBeHidden();
  await expect(button).toBeFocused();
});
