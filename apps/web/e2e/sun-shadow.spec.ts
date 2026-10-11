import { expect, type Page, test } from '@playwright/test';

/**
 * The sun and its static shadow (P5-06, ADR-0006): the shadow map is only drawn again after
 * something that casts it changed, never while the camera moves or the scene is idle, and the
 * environment is made in code (no download).
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

const refreshes = (page: Page) => page.evaluate(() => window.__RF__?.shadowRefreshes() ?? -1);

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

/** Idle, and the models have arrived: a model that loads redraws the shadow map once more. */
async function loaded(page: Page) {
  for (let i = 0; i < 20; i += 1) {
    await settle(page);
    const before = (await info(page)).geometries;
    await page.waitForTimeout(500);
    await settle(page);
    if ((await info(page)).geometries === before) return;
  }
  throw new Error('the models never finished loading');
}

/** Counters of a frame that only redraws (no shadow pass), so they are the cost of the picture. */
async function plainFrame(page: Page) {
  const shadowDraws = () => page.evaluate(() => window.__RF__?.shadowRefreshes() ?? -1);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await settle(page);
    const drawn = await shadowDraws();
    const before = (await info(page)).frame;
    await page.evaluate(() => window.__RF__?.invalidate());
    await page.waitForFunction((f) => (window.__RF__?.info()?.frame ?? 0) > f, before);
    await settle(page);
    // A model arriving meanwhile would have redrawn the shadow map: try again.
    if ((await shadowDraws()) === drawn) return info(page);
  }
  throw new Error('no frame without a shadow pass');
}

async function addObjects(page: Page) {
  await page.evaluate(() => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    for (const [id, catalogId, x, z] of [
      ['lamp', 'lamp.floor.cone', 2, 2],
      ['desk', 'test.box', 1.2, 1.4],
    ] as const) {
      const result = hook.session.execute(
        hook.commands.addObject({ id, catalogId, roomId, position: [x, 0, z], rotationY: 0 }),
      );
      if (!result.ok) throw new Error(result.error.message);
    }
    hook.session.select([]);
  });
}

test('the shadow map is redrawn when objects change, not when the camera moves; renderer.info', async ({
  page,
}, testInfo) => {
  await openEditor(page);
  await settle(page);
  const empty = await refreshes(page);
  expect(empty, 'the load draws it once').toBe(1);
  await addObjects(page);
  await loaded(page);
  const added = await refreshes(page);
  expect(added).toBeGreaterThan(empty);

  await page.evaluate(() => window.__RF__?.camera.orbit(0.6, 0.1));
  await settle(page);
  expect(await refreshes(page)).toBe(added);
  expect(await page.evaluate(() => window.__RF__?.lights()?.sceneLights)).toBe(2 + 8 + 2);

  // Idle: no frame, so no shadow map either.
  const idle = (await info(page)).frame;
  await page.waitForTimeout(1500);
  expect((await info(page)).frame).toBe(idle);

  // A frame that redraws the shadow also draws the casters into it; a plain frame does not.
  const plain = await plainFrame(page);
  expect(await refreshes(page)).toBe(added);
  await page.evaluate(() => {
    const hook = window.__RF__;
    hook?.session.execute(
      hook.commands.moveObjects([{ id: 'desk' as never, position: [1.6, 0, 1.4] }]),
    );
  });
  await settle(page);
  const shadowFrame = await info(page);
  expect(await refreshes(page)).toBe(added + 1);
  expect(shadowFrame.calls).toBeGreaterThan(plain.calls);
  expect(shadowFrame.programs).toBe(plain.programs);
  await testInfo.attach('renderer-info-sun-shadow.json', {
    body: JSON.stringify({ plain, shadowFrame }, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify({ plain, shadowFrame }));
});

test('no environment map is downloaded', async ({ page }) => {
  const files: string[] = [];
  page.on('request', (request) => files.push(request.url()));
  await openEditor(page);
  await settle(page);
  expect(files.filter((url) => /\.(hdr|exr|ktx2|env)(\?|$)/i.test(url))).toEqual([]);
});
