import { expect, type Page, test } from '@playwright/test';

/** Waits for the canvas to be mounted, drawn once and with the camera rig ready. */
async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const frame = (page: Page) => page.evaluate(() => window.__RF__?.info()?.frame ?? -1);
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const value = window.__RF__?.camera.snapshot();
    if (!value) throw new Error('camera not ready');
    return value;
  });

/** Waits until no camera transition runs, then lets the trailing frame (if any) pass. */
async function settle(page: Page) {
  await page.waitForFunction(() => window.__RF__?.camera.snapshot()?.transitioning === false);
  await page.waitForTimeout(400);
}

function resizeFirstRoom(page: Page, size: { width: number; depth: number; height: number }) {
  return page.evaluate((next) => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0];
    if (!roomId) throw new Error('no room');
    return hook.session.execute(hook.commands.resizeRoom(roomId as never, next)).ok;
  }, size);
}

const FOV_DEGREES = 50;

/** True when the room's bounding sphere is inside the view cone (the whole room is on screen). */
function roomFits(
  camera: { distance: number },
  room: { width: number; depth: number; height: number },
  aspect: number,
) {
  const radius = Math.hypot(room.width, room.depth, room.height) / 2;
  const halfVertical = (FOV_DEGREES * Math.PI) / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  return Math.asin(radius / camera.distance) <= Math.min(halfVertical, halfHorizontal);
}

async function canvasSize(page: Page) {
  const box = await page.locator('main canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return box;
}

test('the camera starts in perspective, framing the default room, with no console errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await openEditor(page);
  const camera = await snapshot(page);
  expect(camera.view).toBe('perspective');
  expect(camera.transitioning).toBe(false);
  expect(camera.target[0]).toBeCloseTo(0, 3);
  expect(camera.target[1]).toBeCloseTo(1.3, 3);
  const box = await canvasSize(page);
  expect(roomFits(camera, { width: 4, depth: 4.5, height: 2.6 }, box.width / box.height)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

// P2-08: keys 1 / 2 switch the view within the 600 ms budget. The transition is time-based and
// lands on the first frame after 450 ms, so wall-clock time is the budget plus at most two frame
// gaps (waiting for the first frame, and for the landing one). On a CPU-rendered CI runner frames
// can be far apart, so the gap is measured, not assumed.
test('keys 2 and 1 switch to the plan view and back', async ({ page }) => {
  await openEditor(page);
  const before = await snapshot(page);

  // Timed inside the page, from the key press to the frame that lands the camera.
  await page.evaluate(() => {
    const bag = window as unknown as Record<string, number | undefined>;
    window.addEventListener('keydown', () => {
      bag.t0 = performance.now();
    });
    const poll = (now: number) => {
      const camera = window.__RF__?.camera.snapshot();
      if (bag.t0 !== undefined && bag.elapsed === undefined) {
        if (bag.last !== undefined) bag.maxGap = Math.max(bag.maxGap ?? 0, now - bag.last);
        bag.last = now;
        if (camera?.view === 'top' && !camera.transitioning) bag.elapsed = now - bag.t0;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });

  await page.keyboard.press('2');
  // Wait for the in-page measurement itself: the camera can be seen landed before the poll
  // above has recorded it in that same frame.
  const timing = await page
    .waitForFunction(() => {
      const bag = window as unknown as Record<string, number | undefined>;
      return bag.elapsed === undefined ? undefined : { elapsed: bag.elapsed, gap: bag.maxGap ?? 0 };
    })
    .then((handle) => handle.jsonValue());
  if (!timing) throw new Error('the view switch was not timed');
  expect(timing.elapsed).toBeGreaterThan(0);
  expect(timing.elapsed).toBeLessThanOrEqual(600 + 2 * timing.gap);

  const top = await snapshot(page);
  expect(top.view).toBe('top');
  expect(await page.evaluate(() => window.__RF__?.session.getState().view)).toBe('top');
  // Straight down, centred on the room.
  expect(Math.hypot(top.position[0] - top.target[0], top.position[2] - top.target[2])).toBeLessThan(
    0.01,
  );
  expect(top.target[0]).toBeCloseTo(0, 3);
  expect(top.target[2]).toBeCloseTo(0, 3);

  await page.keyboard.press('1');
  await page.waitForFunction(
    () =>
      window.__RF__?.camera.snapshot()?.view === 'perspective' &&
      !window.__RF__.camera.snapshot()?.transitioning,
  );
  const back = await snapshot(page);
  // The framing the user had comes back.
  for (let axis = 0; axis < 3; axis += 1) {
    expect(back.position[axis]).toBeCloseTo(before.position[axis] as number, 2);
    expect(back.target[axis]).toBeCloseTo(before.target[axis] as number, 2);
  }
});

test('the plan view keeps the whole room on screen', async ({ page }) => {
  await openEditor(page);
  await page.keyboard.press('2');
  await settle(page);
  const { zoom } = await snapshot(page);
  const box = await canvasSize(page);
  expect(zoom * 4).toBeLessThanOrEqual(box.width);
  expect(zoom * 4.5).toBeLessThanOrEqual(box.height);
  expect(Math.max((zoom * 4) / box.width, (zoom * 4.5) / box.height)).toBeGreaterThan(0.7);
});

// P2-08: at rest — also right after a transition ends — nothing renders.
test('after a view switch the canvas is idle again', async ({ page }) => {
  await openEditor(page);
  await page.keyboard.press('2');
  await settle(page);
  const resting = await frame(page);
  await page.waitForTimeout(2000);
  expect(await frame(page)).toBe(resting);

  await page.keyboard.press('1');
  await settle(page);
  const restingAgain = await frame(page);
  await page.waitForTimeout(2000);
  expect(await frame(page)).toBe(restingAgain);
});

test('a view switch really animates (several frames), not a single jump', async ({ page }) => {
  await openEditor(page);
  await page.waitForTimeout(500);
  const before = await frame(page);
  await page.keyboard.press('2');
  await settle(page);
  expect((await frame(page)) - before).toBeGreaterThan(3);
});

test('a document change still costs exactly one frame in the plan view', async ({ page }) => {
  await openEditor(page);
  await page.keyboard.press('2');
  await settle(page);
  const idle = await frame(page);

  expect(await resizeFirstRoom(page, { width: 6, depth: 6, height: 2.6 })).toBe(true);
  await page.waitForTimeout(600);
  expect((await frame(page)) - idle).toBe(1);
});

test('F frames the whole room again after the camera was moved', async ({ page }) => {
  await openEditor(page);
  const start = await snapshot(page);
  await page.evaluate(() => {
    window.__RF__?.camera.orbit(1.1, 0.2);
    window.__RF__?.camera.dolly(-6);
  });
  await page.waitForTimeout(300);
  expect((await snapshot(page)).distance).not.toBeCloseTo(start.distance, 0);

  await page.keyboard.press('f');
  await settle(page);
  const after = await snapshot(page);
  expect(after.distance).toBeCloseTo(start.distance, 2);
  expect(after.target[1]).toBeCloseTo(start.target[1], 2);
});

for (const room of [
  { width: 2, depth: 2, height: 2.2 },
  { width: 12, depth: 12, height: 4 },
]) {
  test(`F fits a ${room.width}×${room.depth} m room completely, in both views`, async ({
    page,
  }) => {
    await openEditor(page);
    expect(await resizeFirstRoom(page, room)).toBe(true);
    await page.waitForTimeout(300);
    const box = await canvasSize(page);

    await page.keyboard.press('f');
    await settle(page);
    const perspective = await snapshot(page);
    expect(roomFits(perspective, room, box.width / box.height)).toBe(true);

    await page.keyboard.press('2');
    await settle(page);
    await page.keyboard.press('f');
    await settle(page);
    const { zoom } = await snapshot(page);
    expect(zoom * room.width).toBeLessThan(box.width);
    expect(zoom * room.depth).toBeLessThan(box.height);
  });
}

// P2-08: the camera cannot go below the floor or farther than 4 diagonals, however it is driven.
test('the camera cannot go through the floor', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => window.__RF__?.camera.orbit(0, 10));
  await page.waitForTimeout(300);
  const camera = await snapshot(page);
  expect(camera.position[1]).toBeGreaterThan(0);
  expect(camera.position[1]).toBeGreaterThan(camera.target[1]);
});

test('the camera cannot move farther than 4 room diagonals away', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => window.__RF__?.camera.dolly(-100000));
  await page.waitForTimeout(300);
  const diagonal = Math.hypot(4, 4.5, 2.6);
  expect((await snapshot(page)).distance).toBeLessThanOrEqual(4 * diagonal + 1e-3);
});

test('shrinking the room pulls a far camera back inside the new limits', async ({ page }) => {
  await openEditor(page);
  expect(await resizeFirstRoom(page, { width: 12, depth: 12, height: 4 })).toBe(true);
  await page.evaluate(() => window.__RF__?.camera.dolly(-100000));
  await page.waitForTimeout(300);
  expect(await resizeFirstRoom(page, { width: 2, depth: 2, height: 2.2 })).toBe(true);
  await page.waitForTimeout(300);
  expect((await snapshot(page)).distance).toBeLessThanOrEqual(4 * Math.hypot(2, 2, 2.2) + 1e-3);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the view switches at once, without animating', async ({ page }) => {
    await openEditor(page);
    await page.waitForTimeout(500);
    const before = await frame(page);

    await page.keyboard.press('2');
    await page.waitForFunction(() => window.__RF__?.camera.snapshot()?.view === 'top');
    expect((await snapshot(page)).transitioning).toBe(false);
    await page.waitForTimeout(500);
    expect((await frame(page)) - before).toBeLessThanOrEqual(3);
  });
});
