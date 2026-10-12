import { expect, type Page, test } from '@playwright/test';

declare global {
  interface Window {
    __opened?: { url: string; target?: string | undefined; features?: string | undefined }[];
  }
}

/** Records `window.open` instead of opening GitHub: the test checks the address it would visit. */
async function captureOpen(page: Page) {
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (url, target, features) => {
      window.__opened?.push({ url: String(url), target, features });
      return null;
    };
  });
}

async function openedUrl(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__opened?.length ?? 0)).toBe(1);
  const [call] = await page.evaluate(() => window.__opened ?? []);
  if (!call) throw new Error('window.open was not called');
  expect(call.target).toBe('_blank');
  expect(call.features).toContain('noopener');
  return new URL(call.url);
}

test('feedback from the editor opens a prefilled GitHub issue without the project', async ({
  page,
}) => {
  await captureOpen(page);
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
  const banner = page.getByRole('banner');
  await banner.getByRole('button', { name: 'Rename project: Untitled project' }).click();
  await page.keyboard.type('Secret studio 42');
  await page.keyboard.press('Enter');
  const objectIds = await page.evaluate(() =>
    Object.keys(window.__RF__?.session.getState().document.objects ?? {}),
  );

  // Keyboard only: the top bar button, the message, the details box, then "Open on GitHub".
  await banner.getByRole('button', { name: 'Send feedback' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Send feedback' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Something does not work' })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('textbox', { name: 'Your message' })).toBeFocused();
  await page.keyboard.type('The lamp stays dark & the "night" view is grey\nSecond line');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('checkbox', { name: 'Include technical details' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialog.getByText(/Renderer: calls \d+/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Open on GitHub' }).focus();
  await page.keyboard.press('Enter');

  const url = await openedUrl(page);
  expect(`${url.origin}${url.pathname}`).toBe(
    'https://github.com/MarcSagues/room-forge/issues/new',
  );
  expect([...url.searchParams.keys()].sort()).toEqual(['details', 'message', 'template', 'title']);
  expect(url.searchParams.get('template')).toBe('beta-bug.yml');
  expect(url.searchParams.get('title')).toBe(
    '[Beta bug] The lamp stays dark & the "night" view is grey',
  );
  expect(url.searchParams.get('message')).toBe(
    'The lamp stays dark & the "night" view is grey\nSecond line',
  );
  const details = url.searchParams.get('details') ?? '';
  expect(details).toContain('- RoomForge: ');
  expect(details).toContain('- Browser: ');
  expect(details).toContain('- Graphics quality: medium');
  expect(details).toMatch(/- Renderer: calls \d+/);
  // Nothing of the project: not its name, not its objects.
  const decoded = decodeURIComponent(url.href);
  expect(decoded).not.toContain('Secret studio 42');
  for (const id of objectIds) expect(decoded).not.toContain(id);
  await expect(dialog.getByRole('status')).toHaveText(/opened in a new tab/);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(banner.getByRole('button', { name: 'Send feedback' })).toBeFocused();
});

test('the landing footer sends an idea, in English and in Spanish', async ({ page }) => {
  await captureOpen(page);
  await page.goto('/es/');
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('button', { name: 'Enviar comentarios' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Enviar comentarios' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('lang', 'es');
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('radio', { name: 'Una idea o una petición' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Abrir en GitHub' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Escribe primero un mensaje.');
  await dialog.getByRole('textbox', { name: 'Tu mensaje' }).fill('Más lámparas LED');
  await dialog.getByRole('button', { name: 'Abrir en GitHub' }).click();

  const url = await openedUrl(page);
  expect(url.searchParams.get('template')).toBe('beta-idea.yml');
  expect(url.searchParams.get('title')).toBe('[Beta idea] Más lámparas LED');
  expect(url.searchParams.has('details')).toBe(false);

  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible();
});
