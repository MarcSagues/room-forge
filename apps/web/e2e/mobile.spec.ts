import { type CDPSession, devices, expect, type Page, test } from '@playwright/test';

/**
 * The touch viewer (P7-06) on emulated phones: Chromium with a phone's screen, pixel ratio, user
 * agent and touch. Fingers are real touch events sent through the DevTools protocol, so they reach
 * the page as `pointerType: 'touch'` pointer events like on a device.
 */

// The iPhone descriptor asks for WebKit; here it only lends its screen to Chromium (TESTING §5).
const { defaultBrowserType: _webkit, ...iPhone14 } = devices['iPhone 14'];
const { defaultBrowserType: _webkitLandscape, ...iPhone14Landscape } =
  devices['iPhone 14 landscape'];
const { defaultBrowserType: _chromium, ...pixel7 } = devices['Pixel 7'];

const sceneReady = (page: Page) =>
  page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );

const snapshot = (page: Page) =>
  page.evaluate(() => {
    const value = window.__RF__?.camera.snapshot();
    if (!value) throw new Error('camera not ready');
    return value;
  });

const settle = async (page: Page) => {
  await page.waitForFunction(() => window.__RF__?.camera.snapshot()?.transitioning === false);
  await page.waitForTimeout(600); // camera-controls' damping
};

const documentJson = (page: Page) =>
  page.evaluate(() => JSON.stringify(window.__RF__?.session.getState().document));

const addBox = (page: Page, id: string, x: number) =>
  page.evaluate(
    ({ id, x }) => {
      const hook = window.__RF__;
      if (!hook) throw new Error('E2E hook missing');
      const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
      const added = hook.session.execute(
        hook.commands.addObject({
          id,
          catalogId: 'test.box',
          roomId,
          position: [x, 0, 1.5],
          rotationY: 0,
        }),
      );
      if (!added.ok) throw new Error(added.error.code);
    },
    { id, x },
  );

type Point = readonly [number, number];

/** Fingers on the screen: one `touchStart`, `steps` moves from `from` to `to`, one `touchEnd`. */
async function gesture(cdp: CDPSession, from: Point[], to: Point[], steps = 12) {
  const at = (t: number) =>
    from.map(([x, y], id) => {
      const [tx, ty] = to[id] ?? [x, y];
      return { x: x + (tx - x) * t, y: y + (ty - y) * t, id };
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * A double tap with the fingers' own timestamps (50 ms taps, 100 ms apart), so a busy machine
 * handling the events late cannot stretch it past the double-tap timing.
 */
async function doubleTap(cdp: CDPSession, [x, y]: Point) {
  const t0 = Date.now() / 1000;
  const send = (type: 'touchStart' | 'touchEnd', at: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchStart' ? [{ x, y }] : [],
      timestamp: t0 + at,
    });
  await send('touchStart', 0);
  await send('touchEnd', 0.05);
  await send('touchStart', 0.15);
  await send('touchEnd', 0.2);
}

async function canvasCentre(page: Page): Promise<Point> {
  const box = await page.locator('main canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return [box.x + box.width / 2, box.y + box.height / 2];
}

/** The page never scrolled or zoomed under the fingers: only the camera moved. */
const pageUntouched = (page: Page) =>
  page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    scale: window.visualViewport?.scale ?? 1,
  }));

/** Each view control is at least 44 × 44 px (DESIGN_SYSTEM §7). */
async function expectTouchTargets(page: Page) {
  for (const name of ['Perspective', 'Top', /^Walls/, 'Frame']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box?.height ?? 0, String(name)).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, String(name)).toBeGreaterThanOrEqual(44);
  }
}

test.describe('on a phone (Pixel 7)', () => {
  test.use(pixel7);

  test('the editor is a touch viewer: orbit, pinch, double tap, and no editing', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/editor/');
    await sceneReady(page);
    await addBox(page, 'desk', 1.5);
    await settle(page);

    await expect(page.getByText('Open RoomForge on a computer to edit.')).toBeVisible();
    await expect(page.getByRole('button', { name: /undo/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);
    await expectTouchTargets(page);
    // Phones get the low light pool (P5-05) and at most 1.5× pixels on a 2.6× screen.
    expect((await page.evaluate(() => window.__RF__?.lights()))?.points).toBe(4);
    const canvas = await page.locator('main canvas').evaluate((element) => ({
      ratio: (element as HTMLCanvasElement).width / element.clientWidth,
    }));
    expect(canvas.ratio).toBeLessThanOrEqual(1.5 + 0.01);

    const cdp = await page.context().newCDPSession(page);
    const before = await documentJson(page);
    const fitted = await snapshot(page);

    // One finger on the box orbits: the box neither moves nor gets selected.
    const box = await page.evaluate(() => window.__RF__?.project('desk' as never) ?? null);
    if (!box) throw new Error('box not on screen');
    await gesture(cdp, [[box.x, box.y]], [[box.x + 140, box.y]]);
    await settle(page);
    const orbited = await snapshot(page);
    expect(
      Math.hypot(...orbited.position.map((v, i) => v - (fitted.position[i] ?? 0))),
    ).toBeGreaterThan(0.2);
    expect(await documentJson(page)).toBe(before);
    expect(await page.evaluate(() => window.__RF__?.session.getState().selection)).toEqual([]);

    // Two fingers spreading apart zoom in.
    const [cx, cy] = await canvasCentre(page);
    await gesture(
      cdp,
      [
        [cx - 40, cy],
        [cx + 40, cy],
      ],
      [
        [cx - 140, cy],
        [cx + 140, cy],
      ],
    );
    await settle(page);
    expect((await snapshot(page)).distance).toBeLessThan(orbited.distance - 0.2);

    // A double tap frames the room again.
    await doubleTap(cdp, [cx, cy]);
    await settle(page);
    const reframed = await snapshot(page);
    expect(reframed.distance).toBeCloseTo(fitted.distance, 1);

    expect(await pageUntouched(page)).toEqual({ scrollX: 0, scrollY: 0, scale: 1 });
    expect(await documentJson(page)).toBe(before);
    expect(errors).toEqual([]);
  });

  test('a shared link opens as a touch viewer; fingers move the camera, never the room', async ({
    page,
    browser,
    baseURL,
  }) => {
    // The link is made on a computer, as the owner would.
    const desk = await browser.newContext({
      ...devices['Desktop Chrome'],
      baseURL: baseURL ?? '',
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const owner = await desk.newPage();
    await owner.goto('/editor/');
    await sceneReady(owner);
    await addBox(owner, 'desk', 1.5);
    await owner.getByRole('button', { name: 'Share' }).click();
    await expect(owner.getByText(/Link copied/)).toBeVisible();
    const link = await owner.evaluate(() => navigator.clipboard.readText());
    await desk.close();

    await page.goto(link);
    await sceneReady(page);
    await settle(page);
    await expect(page.getByRole('heading', { name: 'A shared room, read-only' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make a copy to edit' })).toBeVisible();
    await expectTouchTargets(page);

    // Buttons first: after a protocol-driven swipe, emulated Chromium drops the click of the next
    // tap (a plain page does the same), so the taps come before the fingers.
    const before = await documentJson(page);
    await page.getByRole('button', { name: 'Top' }).tap();
    await expect
      .poll(() => page.evaluate(() => window.__RF__?.session.getState().view))
      .toBe('top');
    await settle(page);
    await page.getByRole('button', { name: 'Frame' }).tap();
    await page.getByRole('button', { name: 'Perspective' }).tap();
    await expect
      .poll(() => page.evaluate(() => window.__RF__?.session.getState().view))
      .toBe('perspective');
    await settle(page);

    const cdp = await page.context().newCDPSession(page);
    const start = await snapshot(page);
    // The link shortens ids: find the box by what it is.
    const box = await page.evaluate(() => {
      const hook = window.__RF__;
      const id = Object.keys(hook?.session.getState().document.objects ?? {})[0];
      return id ? (hook?.project(id as never) ?? null) : null;
    });
    if (!box) throw new Error('box not on screen');
    await gesture(cdp, [[box.x, box.y]], [[box.x - 120, box.y + 30]]);
    await settle(page);
    const after = await snapshot(page);
    expect(
      Math.hypot(...after.position.map((v, i) => v - (start.position[i] ?? 0))),
    ).toBeGreaterThan(0.2);
    expect(await page.evaluate(() => window.__RF__?.session.getState().selection)).toEqual([]);
    expect(await pageUntouched(page)).toEqual({ scrollX: 0, scrollY: 0, scale: 1 });
    expect(await documentJson(page)).toBe(before);
  });
});

test.describe('on an iPhone screen', () => {
  test.use(iPhone14);

  test('portrait: the viewer with touch-sized controls', async ({ page }) => {
    await page.goto('/editor/');
    await sceneReady(page);
    await expect(page.getByText('Open RoomForge on a computer to edit.')).toBeVisible();
    await expectTouchTargets(page);
  });
});

test.describe('on an iPhone turned on its side', () => {
  test.use(iPhone14Landscape);

  test('landscape is wide enough for drawers but stays the viewer', async ({ page }) => {
    await page.goto('/editor/');
    await sceneReady(page);
    await expect(page.getByText('Open RoomForge on a computer to edit.')).toBeVisible();
    await expect(page.getByRole('button', { name: /undo/i })).toHaveCount(0);
    await expectTouchTargets(page);
    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(size.scrollWidth).toBe(size.width);
    expect(size.scrollHeight).toBe(size.height);
  });
});
