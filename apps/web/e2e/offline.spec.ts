import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';

/**
 * The service worker (P8-05). Only this spec turns it on (E2E builds register it on request), so
 * no other spec runs under it. Serial: the update test rewrites `out/sw.js` for a moment.
 */
test.describe.configure({ mode: 'serial' });

const SW_FILE = fileURLToPath(new URL('../out/sw.js', import.meta.url));

async function optIn(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem('roomforge.e2e.serviceWorker', '1');
  });
}

async function openEditor(page: Page) {
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

/** Waits until the worker controls the page, which it does once everything is precached. */
async function waitControlled(page: Page) {
  await page.waitForFunction(
    () => navigator.serviceWorker.controller?.state === 'activated',
    null,
    {
      timeout: 20_000,
    },
  );
}

/** The version of the worker that controls the page. */
const workerVersion = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => resolve(String(event.data));
        navigator.serviceWorker.controller?.postMessage({ type: 'VERSION' }, [channel.port2]);
      }),
  );

async function addObject(page: Page, id: string, catalogId: string) {
  await page.evaluate(
    ({ id, catalogId }) => {
      const hook = window.__RF__;
      if (!hook) throw new Error('E2E hook missing');
      const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
      const result = hook.session.execute(
        hook.commands.addObject({ id, catalogId, roomId, position: [2, 0, 2], rotationY: 0 }),
      );
      if (!result.ok) throw new Error(result.error.message);
    },
    { id, catalogId },
  );
}

const objectIds = (page: Page) =>
  page.evaluate(() => Object.keys(window.__RF__?.session.getState().document.objects ?? {}));

test('after one visit the editor opens offline with the saved project and its cached model', async ({
  page,
  context,
}) => {
  await optIn(context);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/content security policy|refused to/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('/editor/');
  await openEditor(page);
  await waitControlled(page);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const precache = names.find((name) => name.startsWith('roomforge-precache-'));
    if (!precache) return null;
    const keys = (await (await caches.open(precache)).keys()).map((r) => new URL(r.url).pathname);
    return { names, keys };
  });
  expect(cached, 'the worker made its precache').not.toBeNull();
  for (const path of ['/', '/editor/', '/projects/', '/view/', '/404.html', '/theme-init.js']) {
    expect(cached?.keys).toContain(path);
  }
  expect(cached?.keys.filter((key) => key.startsWith('/_next/static/')).length).toBeGreaterThan(10);

  // A catalog model used while online goes into the asset cache.
  const before = (await page.evaluate(() => window.__RF__?.info()?.triangles)) ?? 0;
  await addObject(page, 'chair', 'chair.gaming.racing');
  await page.waitForFunction(
    (base) => (window.__RF__?.info()?.triangles ?? 0) > base + 4000,
    before,
  );
  await page.waitForFunction(() => window.__RF__?.autosave.state()?.status === 'saved');
  const models = await page.evaluate(async () =>
    (await (await caches.open('roomforge-assets-v1')).keys()).map((r) => new URL(r.url).pathname),
  );
  expect(models).toEqual(['/assets/models/chair.gaming.racing.glb']);

  // Airplane mode: the page, its scripts and the model all come from the worker.
  await context.setOffline(true);
  const model = page.waitForResponse((response) => response.url().endsWith('.glb'));
  await page.reload();
  await openEditor(page);
  expect(await objectIds(page)).toEqual(['chair']);
  expect((await model).fromServiceWorker()).toBe(true);
  await page.waitForFunction(
    (base) => (window.__RF__?.info()?.triangles ?? 0) > base + 4000,
    before,
  );

  // And it can still be edited: the change is saved to IndexedDB with no network.
  await addObject(page, 'second', 'test.box');
  await page.waitForFunction(() => window.__RF__?.autosave.state()?.status === 'saved');
  await page.reload();
  await openEditor(page);
  expect((await objectIds(page)).sort()).toEqual(['chair', 'second']);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('a new version waits, offers a reload, and reloading keeps the last edit', async ({
  page,
  context,
}) => {
  await optIn(context);
  await page.goto('/editor/');
  await openEditor(page);
  await waitControlled(page);
  const first = await workerVersion(page);

  const original = readFileSync(SW_FILE, 'utf8');
  try {
    // A new deploy, as the browser sees it: same files, another manifest version.
    writeFileSync(SW_FILE, original.replace(`"version":"${first}"`, `"version":"${first}-next"`));
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    const toast = page.getByRole('listitem').filter({ hasText: 'Update available' });
    await expect(toast).toBeVisible({ timeout: 15_000 });
    // Waiting: the page still runs the version it started with.
    expect(await workerVersion(page)).toBe(first);

    // An edit autosave has not written yet when the person accepts.
    await addObject(page, 'late', 'test.box');
    const reloaded = page.waitForEvent('framenavigated');
    await toast.getByRole('button', { name: 'Reload' }).click();
    await reloaded;
    await openEditor(page);
    expect(await objectIds(page)).toContain('late');
    await waitControlled(page);
    expect(await workerVersion(page)).toBe(`${first}-next`);
  } finally {
    writeFileSync(SW_FILE, original);
  }
});
