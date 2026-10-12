import { createRequire } from 'node:module';
import { expect, type Page, test } from '@playwright/test';

declare global {
  interface Window {
    __violations?: string[];
    __panelShift?: number;
  }
}

const require = createRequire(import.meta.url);

/**
 * The catalog panel (P4-06): thumbnails under the strict CSP without layout shift, categories,
 * accent-insensitive search, keyboard placement, and its accessibility.
 */
async function openEditor(page: Page) {
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__violations?.push(`${event.violatedDirective} blocked ${event.blockedURI}`);
    });
    // The layout shifts of anything inside the catalog panel (CLS of the panel).
    window.__panelShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{
        value: number;
        hadRecentInput: boolean;
        sources?: Array<{ node?: Node | null }>;
      }>) {
        const inPanel = entry.sources?.some((source) =>
          source.node?.parentElement?.closest('[aria-label="Catalog panel"]'),
        );
        if (inPanel && !entry.hadRecentInput)
          window.__panelShift = (window.__panelShift ?? 0) + entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const list = (page: Page) => page.getByRole('list', { name: 'Catalog items' });
const cards = (page: Page) => list(page).getByRole('button');
const names = (page: Page) =>
  list(page)
    .getByRole('listitem')
    .evaluateAll((items) => items.map((item) => item.querySelector('.font-medium')?.textContent));

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test('thumbnails load from the same origin under the CSP, into space reserved for them', async ({
  page,
}) => {
  const first = list(page).getByRole('listitem').first();
  const before = await first.boundingBox();
  const picture = cards(page).first().locator('img');
  await expect(picture).toHaveAttribute(
    'src',
    /^\/assets\/thumbnails\/desk\.office\.140\.[0-9a-f]{10}\.webp$/,
  );
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(256);

  // Scroll to the end: the lazy pictures further down load too.
  const last = cards(page).last();
  await last.scrollIntoViewIfNeeded();
  const lastModel = list(page).getByRole('listitem').nth(14).locator('img');
  await expect
    .poll(() => lastModel.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(256);
  // The stub boxes have no picture: a swatch of their colour.
  await expect(last.locator('img')).toHaveCount(0);

  await list(page).evaluate((element) => element.scrollTo(0, 0));
  expect(await first.boundingBox()).toEqual(before);
  expect(await page.evaluate(() => window.__panelShift)).toBeLessThan(0.001);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});

test('a category and the search narrow the cards; "lámp" finds the lamps', async ({ page }) => {
  await expect(list(page).getByRole('listitem')).toHaveCount(20);
  const group = page.getByRole('group', { name: 'Categories' });
  await expect(group.getByRole('button')).toHaveText([
    'All',
    'Desks',
    'Seating',
    'Storage',
    'Computing',
    'Lighting',
    'Decor',
  ]);

  await group.getByRole('button', { name: 'Seating' }).click();
  expect(await names(page)).toEqual([
    'Racing gaming chair',
    'Ergonomic gaming chair',
    'Padded gaming chair',
    'Office chair',
  ]);

  await group.getByRole('button', { name: 'All' }).click();
  await page.getByRole('searchbox', { name: 'Search the catalog' }).fill('lámp');
  expect(await names(page)).toEqual(['Cone floor lamp', 'Articulated desk lamp']);

  await group.getByRole('button', { name: 'Seating' }).click();
  await expect(page.getByText('Nothing in Seating matches "lámp".')).toBeVisible();
  await page.getByRole('button', { name: 'Show everything' }).click();
  await expect(list(page).getByRole('listitem')).toHaveCount(20);
});

test('twenty cards render well within 100 ms', async ({ page }) => {
  await page
    .getByRole('group', { name: 'Categories' })
    .getByRole('button', { name: 'Lighting' })
    .click();
  const elapsed = await page.evaluate(async () => {
    const all = [...document.querySelectorAll('fieldset button')].find(
      (button) => button.textContent === 'All',
    ) as HTMLButtonElement;
    const start = performance.now();
    all.click();
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
    return performance.now() - start;
  });
  await expect(list(page).getByRole('listitem')).toHaveCount(20);
  expect(elapsed).toBeLessThan(100);
});

test('the cards are one tab stop; the arrows move between them and Enter places one', async ({
  page,
}) => {
  // The last category, then one Tab to the cards.
  await page
    .getByRole('group', { name: 'Categories' })
    .getByRole('button', { name: 'Decor' })
    .focus();
  await page.keyboard.press('Tab');
  await expect(cards(page).first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown'); // two per row: the fourth card
  await expect(cards(page).nth(3)).toBeFocused();
  await expect(cards(page).nth(3)).toHaveAccessibleName(/^Racing gaming chair/);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Racing gaming chair placed.')).toBeAttached();
  const placed = await page.evaluate(() =>
    Object.values(window.__RF__?.session.getState().document.objects ?? {}).map(
      (object) => object.catalogId,
    ),
  );
  expect(placed).toEqual(['chair.gaming.racing']);
});

test.describe('accessibility', () => {
  // axe is injected as a script tag: the page's CSP would refuse it.
  test.use({ bypassCSP: true });

  test('the catalog panel has no serious accessibility violations (axe)', async ({ page }) => {
    await page
      .getByRole('group', { name: 'Categories' })
      .getByRole('button', { name: 'Lighting' })
      .click();
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
      const results = await axe.run('[aria-label="Catalog panel"]');
      return results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    });
    expect(violations).toEqual([]);
  });
});
