import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

async function openEditor(page: Page, path = '/editor/') {
  await page.goto(path);
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const status = (page: Page) => page.evaluate(() => window.__RF__?.autosave.state()?.status);
const objectIds = (page: Page) =>
  page.evaluate(() => Object.keys(window.__RF__?.session.getState().document.objects ?? {}));

async function addObject(page: Page, id: string, x = 2, z = 2) {
  await page.evaluate(
    ({ id, x, z }) => {
      const hook = window.__RF__;
      if (!hook) throw new Error('E2E hook missing');
      const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
      const result = hook.session.execute(
        hook.commands.addObject({
          id,
          catalogId: 'test.box',
          roomId,
          position: [x, 0, z],
          rotationY: 0,
        }),
      );
      if (!result.ok) throw new Error(result.error.message);
    },
    { id, x, z },
  );
}

const waitSaved = (page: Page) =>
  page.waitForFunction(() => window.__RF__?.autosave.state()?.status === 'saved');

test('the first visit makes a project, and it is listed on the projects screen', async ({
  page,
}) => {
  await openEditor(page);
  await expect(page.getByRole('link', { name: 'Untitled project' })).toBeVisible();
  expect(await status(page)).toBe('saved');
  await page.goto('/projects/');
  await expect(page.getByRole('heading', { level: 2, name: 'Untitled project' })).toBeVisible();
});

test('a change is saved by itself and is there after a reload', async ({ page }) => {
  await openEditor(page);
  await addObject(page, 'desk');
  expect(await status(page)).toBe('dirty');
  await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();
  await waitSaved(page);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await page.reload();
  await page.waitForFunction(() => window.__RF__?.session != null);
  expect(await objectIds(page)).toEqual(['desk']);
});

test('closing the page right after a change does not lose it (50 quick changes, one write)', async ({
  page,
}) => {
  await openEditor(page);
  // Many changes at once, and the page goes away well before the 1.5 s debounce could have saved.
  await page.evaluate(() => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    for (let i = 0; i < 50; i += 1) {
      hook.session.execute(
        hook.commands.addObject({
          id: `o${i}`,
          catalogId: 'test.box',
          roomId,
          position: [0.5 + (i % 7) * 0.5, 0, 0.5 + Math.floor(i / 7) * 0.5],
          rotationY: 0,
        }),
      );
    }
  });
  expect(await status(page)).toBe('dirty');
  await page.reload();
  await page.waitForFunction(() => window.__RF__?.session != null);
  expect(await objectIds(page)).toHaveLength(50);
});

test('Open on the projects screen opens that project, and the editor comes back to it', async ({
  page,
}) => {
  await page.goto('/projects/');
  await page.getByRole('button', { name: 'New project' }).last().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Untitled project' })).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Untitled project 2' })).toBeVisible();

  await page.getByRole('link', { name: 'Open Untitled project 2' }).click();
  await page.waitForFunction(() => window.__RF__?.session != null);
  await expect(page.getByRole('link', { name: 'Untitled project 2' })).toBeVisible();
  await addObject(page, 'lamp');
  await waitSaved(page);

  // No address: it comes back to the last one, with its change.
  await openEditor(page, '/editor/');
  await expect(page.getByRole('link', { name: 'Untitled project 2' })).toBeVisible();
  expect(await objectIds(page)).toEqual(['lamp']);
});

test('a project that does not exist says so, and leads back to the projects', async ({ page }) => {
  await page.goto('/editor/?project=ghost');
  await expect(
    page.getByRole('heading', { level: 1, name: 'This project cannot be opened' }),
  ).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'There is no project' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to your projects' }).click();
  await expect(page).toHaveURL(/\/projects\/?$/);
});

test('when the browser has no room, it says so, offers a copy with the work in it, and recovers', async ({
  page,
}) => {
  await openEditor(page);
  await addObject(page, 'kept');
  await waitSaved(page);

  // From now on writes to the project's document fail the way a full disk does.
  await page.evaluate(() => {
    const real = IDBObjectStore.prototype.put;
    (window as unknown as { __unfail: () => void }).__unfail = () => {
      IDBObjectStore.prototype.put = real;
    };
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args) {
      if (this.name === 'documents') throw new DOMException('full', 'QuotaExceededError');
      return real.apply(this, args);
    };
  });
  await addObject(page, 'unsaved', 3, 3);
  await page.waitForFunction(() => window.__RF__?.autosave.state()?.status === 'error');

  const notice = page.getByRole('alert').filter({ hasText: 'Your latest changes are not saved.' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('no storage left');
  await expect(page.getByRole('status').filter({ hasText: 'Not saved' })).toBeVisible();

  // The copy holds what is on screen, including the change that could not be written.
  const downloading = page.waitForEvent('download');
  await notice.getByRole('button', { name: 'Export a copy' }).click();
  const download = await downloading;
  const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(Object.keys(exported.document.objects).sort()).toEqual(['kept', 'unsaved']);

  // Space comes back: trying again saves everything, and the warning goes away.
  await page.evaluate(() => (window as unknown as { __unfail: () => void }).__unfail());
  await notice.getByRole('button', { name: 'Try again' }).click();
  await waitSaved(page);
  await expect(notice).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.__RF__?.session != null);
  expect((await objectIds(page)).sort()).toEqual(['kept', 'unsaved']);
});

test('without IndexedDB the editor works and says the changes only live in this tab', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });
  await openEditor(page);
  const notice = page.getByRole('alert').filter({ hasText: 'only kept in this tab' });
  await expect(notice).toBeVisible();
  await addObject(page, 'tmp');
  await waitSaved(page);
  expect(await objectIds(page)).toEqual(['tmp']);
  await expect(notice.getByRole('button', { name: 'Export a copy' })).toBeVisible();
});
