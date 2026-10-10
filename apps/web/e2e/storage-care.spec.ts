import { expect, type Page, test } from '@playwright/test';

// These tests check the toasts the other specs start without (see playwright.config.ts).
test.use({ storageState: { cookies: [], origins: [] } });

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

/** Makes the browser say whether it keeps the site's storage, before any page script runs. */
const browserKeepsStorage = (page: Page, persisted: boolean) =>
  page.addInitScript((value) => {
    StorageManager.prototype.persisted = async () => value;
  }, persisted);

const warning = (page: Page) => page.getByText('This browser may clear your projects.');

test('with storage the browser may clear, the warning appears once', async ({ page }) => {
  await browserKeepsStorage(page, false);
  await openEditor(page);
  await expect(warning(page)).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(warning(page)).toBeHidden();

  await page.reload();
  await page.waitForFunction(() => window.__RF__?.session != null);
  // The check runs 2 s after the editor opens; give it time to (not) show.
  await page.waitForTimeout(3_000);
  await expect(warning(page)).toBeHidden();
});

test('kept storage gets no warning', async ({ page }) => {
  await browserKeepsStorage(page, true);
  await openEditor(page);
  await page.waitForTimeout(3_000);
  await expect(warning(page)).toBeHidden();
});

test('after many edits a toast suggests a copy, and "Don\'t show again" is remembered', async ({
  page,
}) => {
  await browserKeepsStorage(page, true);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'roomforge.backupReminder',
      JSON.stringify({ edits: 199, since: Date.now(), never: false }),
    );
  });
  await openEditor(page);
  await page.evaluate(() => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    hook.session.execute(
      hook.commands.addObject({
        id: 'desk',
        catalogId: 'test.box',
        roomId,
        position: [2, 0, 2],
        rotationY: 0,
      }),
    );
  });

  await expect(page.getByText('Time to export a copy?')).toBeVisible();
  await page.getByRole('button', { name: "Don't show again" }).click();
  const stored = await page.evaluate(() => localStorage.getItem('roomforge.backupReminder'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ never: true });
});

test('the settings show how much storage is used', async ({ page }) => {
  await page.goto('/projects/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByText(/used of .* available to RoomForge/)).toBeVisible();
  await expect(dialog.getByRole('meter', { name: 'Storage' })).toBeVisible();
});
