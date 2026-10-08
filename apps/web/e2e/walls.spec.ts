import { expect, type Page, test } from '@playwright/test';

type WallId = 'north' | 'east' | 'south' | 'west';
const WALLS: WallId[] = ['north', 'east', 'south', 'west'];

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const frame = (page: Page) => page.evaluate(() => window.__RF__?.info()?.frame ?? -1);

/** Waits until the canvas stops drawing (wall transitions and camera moves have finished). */
async function settle(page: Page) {
  let previous = await frame(page);
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(150);
    const now = await frame(page);
    if (now === previous) return;
    previous = now;
  }
  throw new Error('the canvas never went idle');
}

function display(page: Page) {
  return page.evaluate(() => {
    const hook = window.__RF__;
    const roomId = Object.keys(hook?.session.getState().document.rooms ?? {})[0];
    const value = roomId ? hook?.roomDisplay(roomId as never) : null;
    if (!value) throw new Error('room not drawn');
    return value;
  });
}

const state = (page: Page) =>
  page.evaluate(() => {
    const value = window.__RF__?.session.getState();
    return { wallMode: value?.wallMode, showCeiling: value?.showCeiling, view: value?.view };
  });

const programs = (page: Page) => page.evaluate(() => window.__RF__?.info()?.programs ?? -1);

test('starts in cutaway: front walls fade, back walls stay opaque, ceiling hidden', async ({
  page,
}) => {
  await openEditor(page);
  await settle(page);
  const shown = await display(page);
  const faded = WALLS.filter((wall) => shown.wallOpacity[wall] < 1);
  expect(faded.length).toBeGreaterThanOrEqual(1);
  expect(faded.length).toBeLessThanOrEqual(2);
  expect(WALLS.some((wall) => shown.wallOpacity[wall] === 1)).toBe(true);
  expect(shown.wallHeightScale).toBe(1);
  expect(shown.ceilingVisible).toBe(false);
  expect(await state(page)).toMatchObject({ wallMode: 'cutaway', showCeiling: false });
});

test('W cycles up → down → cutaway without compiling new shaders', async ({ page }) => {
  await openEditor(page);
  await settle(page);
  const before = await programs(page);

  await page.keyboard.press('w');
  await settle(page);
  expect((await state(page)).wallMode).toBe('down');
  let shown = await display(page);
  expect(shown.wallHeightScale).toBeCloseTo(0.6 / 2.6, 3);
  expect(Object.values(shown.wallOpacity)).toEqual([1, 1, 1, 1]);

  await page.keyboard.press('w');
  await settle(page);
  expect((await state(page)).wallMode).toBe('up');
  shown = await display(page);
  expect(shown.wallHeightScale).toBe(1);
  expect(Object.values(shown.wallOpacity)).toEqual([1, 1, 1, 1]);

  await page.keyboard.press('w');
  await settle(page);
  expect((await state(page)).wallMode).toBe('cutaway');
  shown = await display(page);
  expect(WALLS.filter((wall) => shown.wallOpacity[wall] < 1).length).toBeGreaterThanOrEqual(1);

  expect(await programs(page)).toBe(before);
});

test('a mode change animates over a few frames, then the canvas is idle', async ({ page }) => {
  await openEditor(page);
  await settle(page);
  const start = await frame(page);
  await page.keyboard.press('w');
  await settle(page);
  const used = (await frame(page)) - start;
  expect(used).toBeGreaterThan(1);
  const idle = await frame(page);
  await page.waitForTimeout(500);
  expect(await frame(page)).toBe(idle);
});

test('orbiting 360° always fades the 1–2 front walls and keeps the back ones', async ({ page }) => {
  await openEditor(page);
  await settle(page);
  for (let step = 0; step < 8; step += 1) {
    await page.evaluate(() => window.__RF__?.camera.orbit(Math.PI / 4, 0));
    await settle(page);
    const shown = await display(page);
    const faded = WALLS.filter((wall) => shown.wallOpacity[wall] < 1);
    expect(faded.length, `step ${step}`).toBeGreaterThanOrEqual(1);
    expect(faded.length, `step ${step}`).toBeLessThanOrEqual(2);
    expect(WALLS.length - faded.length, `step ${step}`).toBeGreaterThanOrEqual(2);
  }
});

test('C shows the ceiling in perspective; the plan view hides it automatically', async ({
  page,
}) => {
  await openEditor(page);
  await settle(page);
  await page.keyboard.press('c');
  await settle(page);
  expect((await state(page)).showCeiling).toBe(true);
  expect((await display(page)).ceilingVisible).toBe(true);

  await page.keyboard.press('2');
  await page.waitForFunction(() => window.__RF__?.camera.snapshot()?.transitioning === false);
  await settle(page);
  expect((await display(page)).ceilingVisible).toBe(false);

  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__RF__?.camera.snapshot()?.view === 'perspective');
  await settle(page);
  expect((await display(page)).ceilingVisible).toBe(true);

  await page.keyboard.press('c');
  await settle(page);
  expect((await display(page)).ceilingVisible).toBe(false);
});
