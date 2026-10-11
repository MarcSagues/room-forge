import { expect, type Page, test } from '@playwright/test';

/**
 * Day and night (P5-06): switching eases the global lights for ~700 ms by changing values only, so
 * no shader compiles and the scene keeps the same lights; then the canvas is idle again and the
 * sun's static shadow map is not drawn while nothing changes (ADR-0006, P2-11).
 */

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () =>
      (window.__RF__?.info()?.frame ?? 0) >= 1 &&
      window.__RF__?.camera.snapshot() != null &&
      window.__RF__?.dayNight() != null,
  );
}

const info = async (page: Page) => {
  const value = await page.evaluate(() => window.__RF__?.info());
  if (!value) throw new Error('no render info');
  return value;
};

const dayNight = async (page: Page) => {
  const value = await page.evaluate(() => window.__RF__?.dayNight());
  if (!value) throw new Error('no day/night state');
  return value;
};

const sceneLights = (page: Page) => page.evaluate(() => window.__RF__?.lights()?.sceneLights);

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
    const before = await page.evaluate(() => window.__RF__?.info()?.geometries ?? -1);
    await page.waitForTimeout(500);
    await settle(page);
    const after = await page.evaluate(() => window.__RF__?.info()?.geometries ?? -1);
    if (after === before) return;
  }
  throw new Error('the models never finished loading');
}

/** Counters of a frame that only redraws (no shadow pass), so they are the cost of the picture. */
async function plainFrame(page: Page) {
  const before = (await info(page)).frame;
  await page.evaluate(() => window.__RF__?.invalidate());
  await page.waitForFunction((f) => (window.__RF__?.info()?.frame ?? 0) > f, before);
  await settle(page);
  return info(page);
}

async function setMode(page: Page, mode: 'day' | 'night') {
  await page.evaluate((m) => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const result = hook.session.execute(hook.commands.setLightingMode(m));
    if (!result.ok) throw new Error(result.error.message);
  }, mode);
}

async function addLamp(page: Page) {
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

test('day → night → day compiles nothing, keeps the lights and goes idle; renderer.info', async ({
  page,
}, testInfo) => {
  await openEditor(page);
  await addLamp(page);
  await loaded(page);
  expect(await dayNight(page)).toMatchObject({ mode: 'day', level: 0, transitioning: false });
  const day = await plainFrame(page);
  const lights = await sceneLights(page);
  expect(lights).toBe(2 + 8 + 2); // hemisphere + sun, and the medium light pool
  const shadows = await page.evaluate(() => window.__RF__?.shadowRefreshes());
  await testInfo.attach('day.png', { body: await page.locator('main canvas').screenshot() });

  // N, like a user: the transition takes several frames, then stops by itself.
  await page.locator('main canvas').click({ position: { x: 5, y: 5 } });
  const start = (await info(page)).frame;
  await page.keyboard.press('n');
  await page.waitForFunction(() => window.__RF__?.dayNight()?.transitioning === true);
  await page.waitForFunction(() => window.__RF__?.dayNight()?.level === 1, null, {
    timeout: 10_000,
  });
  await settle(page);
  const night = await plainFrame(page);
  expect(night.frame - start, 'the transition animates over several frames').toBeGreaterThan(3);
  expect(await dayNight(page)).toMatchObject({ mode: 'night', level: 1, transitioning: false });
  await testInfo.attach('night.png', { body: await page.locator('main canvas').screenshot() });

  // Idle: no frame, so no shadow map either.
  const idle = await info(page);
  await page.waitForTimeout(1500);
  expect((await info(page)).frame).toBe(idle.frame);

  await setMode(page, 'day');
  await page.waitForFunction(() => window.__RF__?.dayNight()?.level === 0, null, {
    timeout: 10_000,
  });
  await settle(page);
  const back = await plainFrame(page);

  expect(night.programs).toBe(day.programs);
  expect(back.programs).toBe(day.programs);
  expect(back.textures).toBe(day.textures);
  expect(back.calls).toBe(day.calls);
  expect(await sceneLights(page)).toBe(lights);
  // Changing the mode moves no shadow caster: the static shadow map is never redrawn for it.
  expect(await page.evaluate(() => window.__RF__?.shadowRefreshes())).toBe(shadows);
  await testInfo.attach('renderer-info-day-night.json', {
    body: JSON.stringify({ day, night, back }, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify({ day, night, back }));

  // One undo entry per switch.
  await page.evaluate(() => window.__RF__?.session.undo());
  expect(await page.evaluate(() => window.__RF__?.session.getState().document.lighting.mode)).toBe(
    'night',
  );
});

test('with reduced motion the switch is instant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openEditor(page);
  await settle(page);
  const start = (await info(page)).frame;
  await setMode(page, 'night');
  await page.waitForFunction(() => window.__RF__?.dayNight()?.level === 1);
  await settle(page);
  expect((await info(page)).frame - start).toBe(1);
});
