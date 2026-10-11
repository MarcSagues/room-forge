import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

const require = createRequire(import.meta.url);

test('the landing leads to the editor, the projects and the Spanish version', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'RoomForge' })).toBeVisible();
  await page.getByRole('link', { name: 'Leer en español' }).click();
  await expect(page).toHaveURL(/\/es\/$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Preguntas frecuentes' })).toBeVisible();
  await page.getByRole('link', { name: 'Read in English' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('link', { name: 'My projects' }).click();
  await expect(page).toHaveURL(/\/projects\/$/);
  await page.goto('/');
  await page.getByRole('link', { name: 'Start designing' }).first().click();
  await expect(page).toHaveURL(/\/editor\/$/);
});

test('the footer leads to the legal pages in both languages', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Draft pending legal review');
  await page.getByRole('link', { name: 'Leer en español' }).click();
  await expect(page).toHaveURL(/\/es\/privacidad\/$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Política de privacidad' }),
  ).toBeVisible();
  await page.getByRole('contentinfo').getByRole('link', { name: 'Licencias' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Modelos 3D del catálogo' }),
  ).toBeVisible();
  await page.getByRole('contentinfo').getByRole('link', { name: 'Términos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Términos de uso' })).toBeVisible();
});

test('the FAQ opens from the keyboard and the skip link reaches the content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#content$/);

  const question = page.locator('summary', { hasText: 'Do I need an account?' });
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('RoomForge works without signing up.')).toBeVisible();
});

test('no cookies and no request to another origin, from the landing to the editor', async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1').origin;
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== origin) foreign.push(request.url());
  });
  await page.goto('/');
  await page.goto('/es/');
  await page.goto('/projects/');
  await page.goto('/editor/');
  await page.waitForFunction(() => (window.__RF__?.info()?.frame ?? 0) >= 1);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe('');
  expect(foreign).toEqual([]);
});

test('robots.txt, the sitemap, the manifest and the card image are in the export', async ({
  request,
}) => {
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  // E2E builds have no SITE_URL: a preview is closed to crawlers.
  expect(await robots.text()).toContain('Disallow: /');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml).toContain('<loc>');
  expect(xml).toContain('/es/</loc>');

  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect(JSON.parse(await manifest.text())).toMatchObject({ name: 'RoomForge', start_url: '/' });

  const image = await request.get('/og.png');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toBe('image/png');
});

test.describe('accessibility', () => {
  // axe is injected as a script tag: the page's CSP would refuse it.
  test.use({ bypassCSP: true });

  for (const path of ['/', '/es/', '/privacy/', '/es/privacidad/', '/terms/', '/es/licencias/']) {
    test(`${path} has no serious accessibility violations (axe, with contrast)`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
        const results = await axe.run(document);
        return results.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
      });
      expect(violations).toEqual([]);
    });
  }
});
