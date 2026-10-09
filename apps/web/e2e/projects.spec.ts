import { expect, type Page, test } from '@playwright/test';

/** Fails the test on anything the page logs as an error or throws: the screen must be quiet. */
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  return problems;
}

const cards = (page: Page) =>
  page.getByRole('list', { name: 'Your projects' }).getByRole('listitem');
const heading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name });

test('projects are created, renamed, duplicated and kept after a reload', async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto('/projects/');
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  await expect(page.getByText('No projects yet')).toBeVisible();

  // The first project, from the empty state's call to action.
  await page.getByRole('button', { name: 'New project' }).last().click();
  await expect(heading(page, 'Untitled project')).toBeVisible();

  // Rename it with the keyboard.
  await page.getByRole('button', { name: 'Rename Untitled project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Gaming room');
  await page.keyboard.press('Enter');
  await expect(heading(page, 'Gaming room')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename Gaming room' })).toBeFocused();

  await page.getByRole('button', { name: 'Duplicate Gaming room' }).click();
  await expect(heading(page, 'Gaming room (copy)')).toBeVisible();
  await expect(cards(page)).toHaveCount(2);

  // Everything is still there after a reload, newest first.
  await page.reload();
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first().getByRole('heading')).toHaveText('Gaming room (copy)');
  await expect(cards(page).nth(1).getByRole('heading')).toHaveText('Gaming room');

  // The search finds one of them.
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('copy');
  await expect(cards(page)).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('');
  await expect(cards(page)).toHaveCount(2);

  expect(problems).toEqual([]);
});

test('a deleted project can be brought back for 8 seconds, then it is gone for good', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/projects/');
  await page.getByRole('button', { name: 'New project' }).last().click();
  await expect(heading(page, 'Untitled project')).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await expect(cards(page)).toHaveCount(2);

  // Delete and undo within the window: it comes back and survives a reload.
  await page.getByRole('button', { name: 'Delete Untitled project 2' }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText('“Untitled project 2” was deleted.');
  await page.clock.fastForward(5_000);
  await page.getByRole('button', { name: 'Undo deleting Untitled project 2' }).click();
  await expect(cards(page)).toHaveCount(2);
  await page.clock.fastForward(20_000);
  await page.reload();
  await expect(cards(page)).toHaveCount(2);

  // Delete and let the time run out: it is gone, also after a reload.
  await page.clock.install();
  await page.getByRole('button', { name: 'Delete Untitled project 2' }).click();
  await expect(cards(page)).toHaveCount(1);
  await page.clock.fastForward(8_100);
  await expect(page.getByText('“Untitled project 2” was deleted.')).toBeHidden();
  await page.reload();
  await expect(cards(page)).toHaveCount(1);
  await expect(heading(page, 'Untitled project 2')).toHaveCount(0);
});

test('without IndexedDB the screen still works, and says projects will not be kept', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });
  await page.goto('/projects/');
  // (Next adds a role="alert" of its own for route changes, so the notice is found by its text.)
  const notice = page.getByRole('alert').filter({ hasText: 'This browser is not letting' });
  await expect(notice).toContainText('kept only until you close this tab');
  await page.getByRole('button', { name: 'New project' }).last().click();
  await expect(heading(page, 'Untitled project')).toBeVisible();
  await page.reload();
  await expect(page.getByText('No projects yet')).toBeVisible();
});

test('the home page leads to the projects screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'My projects' }).click();
  await expect(page).toHaveURL(/\/projects\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
});
