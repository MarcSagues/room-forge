import { expect, type Page, test } from '@playwright/test';

/**
 * Catalog models (P4-04): a model is downloaded only once an object shows it, drawn instead of its
 * placeholder, shared by every object of the item, and freed with the last of them.
 */

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const info = async (page: Page) => {
  const value = await page.evaluate(() => window.__RF__?.info());
  if (!value) throw new Error('no render info');
  return value;
};

async function settle(page: Page) {
  let previous = (await info(page)).frame;
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(150);
    const now = (await info(page)).frame;
    if (now === previous) return;
    previous = now;
  }
  throw new Error('the canvas never went idle');
}

/** GLB downloads the page asked for. */
function watchModels(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.glb')) urls.push(new URL(request.url()).pathname);
  });
  return urls;
}

async function add(page: Page, objects: Array<[string, string, number, number]>) {
  await page.evaluate((list) => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    for (const [id, catalogId, x, z] of list) {
      const result = hook.session.execute(
        hook.commands.addObject({
          id: id as never,
          catalogId,
          roomId,
          position: [x, 0, z],
          rotationY: 0,
        }),
      );
      if (!result.ok) throw new Error(result.error.message);
    }
    hook.session.select([]);
  }, objects);
  await settle(page);
}

async function remove(page: Page, ids: string[]) {
  await page.evaluate((list) => {
    const hook = window.__RF__;
    const result = hook?.session.execute(hook.commands.removeObjects(list as never[]));
    if (!result?.ok) throw new Error('remove failed');
  }, ids);
  await settle(page);
}

const counters = ({
  calls,
  triangles,
  geometries,
  textures,
  programs,
}: Record<'calls' | 'triangles' | 'geometries' | 'textures' | 'programs', number>) => ({
  calls,
  triangles,
  geometries,
  textures,
  programs,
});

test('a model placed from the catalog panel loads lazily, is shared, and is freed with its objects', async ({
  page,
}) => {
  const requests = watchModels(page);
  await openEditor(page);
  await settle(page);
  const empty = await info(page);
  expect(requests, 'nothing is downloaded before an object uses it').toEqual([]);

  await page
    .getByRole('list', { name: 'Catalog items' })
    .getByRole('button', { name: /^Racing gaming chair/ })
    .click();
  await page.waitForFunction(
    (base) => (window.__RF__?.info()?.triangles ?? 0) > base + 4000,
    empty.triangles,
  );
  // The name carries the file's content hash (P4-03).
  expect(requests).toEqual([
    expect.stringMatching(/^\/assets\/models\/chair\.gaming\.racing\.[0-9a-f]{10}\.glb$/),
  ]);
  const [placed] = await page.evaluate(() =>
    Object.keys(window.__RF__?.session.getState().document.objects ?? {}),
  );
  if (!placed) throw new Error('nothing was placed');
  await page.evaluate(() => window.__RF__?.session.select([]));
  await settle(page);
  const one = await info(page);

  // 19 more of the same item: no new geometry, no new shader, no new download.
  const more = Array.from({ length: 19 }, (_, i): [string, string, number, number] => [
    `chair${i}`,
    'chair.gaming.racing',
    0.5 + (i % 5) * 0.75,
    0.5 + Math.floor(i / 5) * 0.9,
  ]);
  await add(page, more);
  const twenty = await info(page);
  expect(twenty.geometries).toBe(one.geometries);
  expect(twenty.programs).toBe(one.programs);
  expect(twenty.triangles).toBeGreaterThan(one.triangles * 10);
  expect(requests).toHaveLength(1);

  // Removing them all frees the three slot geometries of the model, and only those.
  await remove(page, [placed, ...more.map(([id]) => id)]);
  const after = await info(page);
  expect(after.geometries).toBe(one.geometries - 3);
  expect(after.triangles).toBe(empty.triangles);

  // Coming and going again and again leaves nothing behind.
  for (let i = 0; i < 5; i += 1) {
    await add(page, [[`again${i}`, 'chair.gaming.racing', 2, 2]]);
    await page.waitForFunction(
      (base) => (window.__RF__?.info()?.triangles ?? 0) > base + 4000,
      empty.triangles,
    );
    await settle(page);
    expect((await info(page)).geometries).toBe(one.geometries);
    await remove(page, [`again${i}`]);
    expect((await info(page)).geometries).toBe(after.geometries);
  }
});

test('a model that cannot be downloaded leaves its placeholder; renderer.info before and after', async ({
  browser,
}, testInfo) => {
  const setup: Array<[string, string, number, number]> = [
    ['desk', 'desk.gaming.160', 2, 1],
    ['chair', 'chair.gaming.racing', 2, 2],
    ['flat', 'monitor.27.flat', 1, 3],
    ['wide', 'monitor.ultrawide.34.curved', 3, 3],
  ];
  // Two fresh browsers: each opens a new project with only these objects.
  const offline = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  offline.on('pageerror', (error) => errors.push(error.message));
  await offline.route('**/assets/models/*.glb', (route) => route.abort());
  await openEditor(offline);
  await add(offline, setup);
  const placeholders = counters(await info(offline));
  expect(placeholders.triangles).toBeLessThan(1000); // boxes: the models never arrived
  expect(errors).toEqual([]);

  const page = await (await browser.newContext()).newPage();
  await openEditor(page);
  await add(page, setup);
  await page.waitForFunction(() => (window.__RF__?.info()?.triangles ?? 0) > 9000);
  await settle(page);
  const models = counters(await info(page));
  await testInfo.attach('renderer-info.json', {
    body: JSON.stringify({ placeholders, models }, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify({ placeholders, models }));
  expect(models.geometries - placeholders.geometries).toBe(12); // 3 slots × 4 models
});

test('the six luminaires load and glow with shared materials; renderer.info', async ({
  page,
}, testInfo) => {
  await openEditor(page);
  await settle(page);
  const empty = counters(await info(page));
  await add(page, [
    ['strip', 'led.strip.1m', 1, 1],
    ['bars', 'light.bars.pair', 2, 1],
    ['hex', 'panel.hex.cluster', 3, 1],
    ['floor', 'lamp.floor.cone', 1, 3],
    ['desk', 'lamp.desk.arm', 2, 3],
    ['neon', 'neon.sign.wave', 3, 3],
  ]);
  await page.waitForFunction(({ base }) => (window.__RF__?.info()?.geometries ?? 0) >= base + 15, {
    base: empty.geometries,
  });
  await settle(page);
  const lit = counters(await info(page));
  await testInfo.attach('renderer-info-luminaires.json', {
    body: JSON.stringify({ empty, lit }, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify({ empty, lit }));
  // 2 + 2 + 2 + 3 + 3 + 2 slots, plus the shared placeholder box the empty room did not have.
  expect(lit.geometries - empty.geometries).toBe(15);
  // The placeholder shader, and one glowing shader (not tone mapped) for all six luminaires.
  expect(lit.programs - empty.programs).toBeLessThanOrEqual(2);
});
