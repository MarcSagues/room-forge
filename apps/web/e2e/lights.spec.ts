import { expect, type Page, test } from '@playwright/test';

/**
 * The fixed light pool (P5-05): luminaires borrow the pool's lights, the rest only glow, and
 * switching, recolouring or moving them never compiles a shader nor changes how many lights the
 * scene has (ADR-0006, P2-11).
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

const lights = async (page: Page) => {
  const value = await page.evaluate(() => window.__RF__?.lights());
  if (!value) throw new Error('no light pool');
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

/** Runs a light command (or a move) inside the page and waits for the canvas to settle. */
async function run(
  page: Page,
  change:
    | { all: { on: boolean } }
    | { ids: string[]; patch: { on?: boolean; color?: string; intensity?: number } }
    | { move: string; to: [number, number, number] },
) {
  await page.evaluate((what) => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const command =
      'all' in what
        ? hook.commands.setAllLights(what.all)
        : 'ids' in what
          ? hook.commands.setLight(what.ids as never[], what.patch as never)
          : hook.commands.moveObjects([{ id: what.move as never, position: what.to }]);
    const result = hook.session.execute(command);
    if (!result.ok) throw new Error(result.error.message);
  }, change);
  await settle(page);
}

const SIX: Array<[string, string, number, number]> = [
  ['strip', 'led.strip.1m', 1, 1],
  ['bars', 'light.bars.pair', 2, 1],
  ['hex', 'panel.hex.cluster', 3, 1],
  ['floor', 'lamp.floor.cone', 1, 2.5],
  ['desk', 'lamp.desk.arm', 2, 2.5],
  ['neon', 'neon.sign.wave', 3, 2.5],
];

test('switching, recolouring and moving luminaires compiles nothing; renderer.info', async ({
  page,
}, testInfo) => {
  await openEditor(page);
  await settle(page);
  const empty = await info(page);
  const pool = await lights(page);
  expect(pool).toMatchObject({ points: 8, spots: 2, lit: [] }); // medium quality
  const sceneLights = pool.sceneLights;
  expect(sceneLights).toBe(2 + 8 + 2); // the day stand-ins and the pool, from the start

  await add(page, SIX);
  await page.waitForFunction(({ base }) => (window.__RF__?.info()?.geometries ?? 0) >= base + 15, {
    base: empty.geometries,
  });
  await settle(page);
  const lit = await info(page);
  const allOn = await lights(page);
  expect(allOn.lit).toHaveLength(6);
  expect(allOn.lit.at(-1)).toBe('desk'); // spot slots come last: the desk lamp has a spot
  await testInfo.attach('renderer-info-light-pool.json', {
    body: JSON.stringify({ empty, sixOn: lit }, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify({ empty, sixOn: lit }));

  const steps: Parameters<typeof run>[1][] = [
    { all: { on: false } },
    { all: { on: true } },
    { ids: SIX.map(([id]) => id), patch: { color: '#00ff88' } },
    { ids: ['strip', 'neon'], patch: { intensity: 0.3 } },
    { ids: ['hex'], patch: { on: false } },
    { move: 'floor', to: [0.6, 0, 0.6] },
    { ids: ['desk'], patch: { color: '#ff2200' } },
  ];
  for (const step of steps) {
    await run(page, step);
    const now = await info(page);
    expect(now.programs, JSON.stringify(step)).toBe(lit.programs);
    expect((await lights(page)).sceneLights, JSON.stringify(step)).toBe(sceneLights);
  }
  expect((await lights(page)).lit).toHaveLength(5); // the panel is off
  await run(page, { all: { on: false } });
  expect((await lights(page)).lit).toEqual([]);
  expect((await info(page)).programs).toBe(lit.programs);
});

test('twenty luminaires share eight point lights; orbiting a little does not reshuffle them', async ({
  page,
}) => {
  await openEditor(page);
  await settle(page);
  const strips = Array.from({ length: 20 }, (_, i): [string, string, number, number] => [
    `strip${i}`,
    'led.strip.1m',
    0.6 + (i % 5) * 0.7,
    0.5 + Math.floor(i / 5) * 0.6,
  ]);
  await add(page, strips);
  const before = await lights(page);
  expect(before.lit).toHaveLength(8);
  const programs = (await info(page)).programs;

  await page.evaluate(() => window.__RF__?.camera.orbit(0.05, 0));
  await settle(page);
  await page.waitForTimeout(400); // past the driver's settling delay
  await settle(page);
  expect((await lights(page)).lit).toEqual(before.lit);
  expect((await info(page)).programs).toBe(programs);
  expect((await lights(page)).sceneLights).toBe(before.sceneLights);
});
