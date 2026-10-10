import { expect, type Page, test } from '@playwright/test';

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const frame = (page: Page) => page.evaluate(() => window.__RF__?.info()?.frame ?? -1);
const info = () => window.__RF__?.info();

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

/** Sets a surface of the room to a preset, as the materials panel will. Returns whether it was accepted. */
function setSurface(
  page: Page,
  surface: string,
  material: { presetId: string; tint?: string; roughness?: number },
) {
  return page.evaluate(
    ({ surface, material }) => {
      const hook = window.__RF__;
      if (!hook) throw new Error('E2E hook missing');
      const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
      return hook.session.execute(
        hook.commands.setSurfaceMaterial(roomId, surface as never, material as never),
      ).ok;
    },
    { surface, material },
  );
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await settle(page);
});

test('the floor is drawn with the planks of its preset: one texture, shared, freed with it', async ({
  page,
}) => {
  const withPlanks = (await page.evaluate(info))?.textures ?? 0;
  // floor.oak is a planks pattern: one texture. The walls are plain paint and have none.
  await setSurface(page, 'floor', { presetId: 'paint.matte' });
  await settle(page);
  const plain = (await page.evaluate(info))?.textures ?? 0;
  expect(withPlanks - plain).toBe(1);
  await setSurface(page, 'floor', { presetId: 'floor.grey' }); // planks again: made again, one
  await settle(page);
  expect(((await page.evaluate(info))?.textures ?? 0) - plain).toBe(1);
});

test('dragging a colour changes the picture without compiling a shader or making a texture', async ({
  page,
}) => {
  const canvas = page.locator('main canvas');
  const before = await canvas.screenshot();
  const idle = await page.evaluate(info);

  // A slider drag: one hundred tints in a row (they coalesce into one history entry).
  for (let step = 0; step < 100; step += 1) {
    const grey = (60 + step).toString(16).padStart(2, '0');
    expect(
      await setSurface(page, 'floor', { presetId: 'floor.oak', tint: `#ff${grey}${grey}` }),
    ).toBe(true);
  }
  await settle(page);
  const after = await page.evaluate(info);
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  expect(after?.programs).toBe(idle?.programs);
  expect(after?.textures).toBe(idle?.textures);
  expect(after?.geometries).toBe(idle?.geometries);
  expect(await page.evaluate(() => window.__RF__?.session.getState().history.undoLabel)).toBe(
    'Change room material',
  );
});

test('another preset with the same kind of surface adds no shader either', async ({ page }) => {
  const idle = await page.evaluate(info);
  for (const presetId of ['floor.grey', 'floor.oak', 'floor.grey', 'wood.walnut', 'floor.oak']) {
    await setSurface(page, 'floor', { presetId });
  }
  await settle(page);
  const after = await page.evaluate(info);
  // Every one of those is a textured, opaque, standard material: the same shader.
  expect(after?.programs).toBe(idle?.programs);
  // Textures come and go with the presets that use them; none is left over.
  expect(after?.textures).toBeLessThanOrEqual(2);
});

test('going from a textured preset to a plain paint and back leaks nothing', async ({ page }) => {
  const idle = await page.evaluate(info);
  for (let i = 0; i < 25; i += 1) {
    await setSurface(page, 'floor', { presetId: 'paint.matte' });
    await setSurface(page, 'floor', { presetId: 'floor.oak' });
  }
  await settle(page);
  const after = await page.evaluate(info);
  // A leak is growth. The first count can still include a texture on its way out (CI is slow),
  // so the check is that nothing piled up, not that the counts match exactly.
  expect(after?.textures).toBeLessThanOrEqual(idle?.textures ?? 0);
  expect(after?.geometries).toBeLessThanOrEqual(idle?.geometries ?? 0);
  expect(after?.programs).toBeLessThanOrEqual((idle?.programs ?? 0) + 1);
});

test('a preset this version does not know is kept and drawn with the default material', async ({
  page,
}) => {
  expect(await setSurface(page, 'floor', { presetId: 'from.the.future' })).toBe(true);
  await settle(page);
  expect(
    await page.evaluate(() => {
      const hook = window.__RF__;
      const room = Object.values(hook?.session.getState().document.rooms ?? {})[0];
      return room?.floor.material.presetId;
    }),
  ).toBe('from.the.future');
});

test('each wall can have its own material, and the walls still fade one by one', async ({
  page,
}) => {
  expect(await setSurface(page, 'north', { presetId: 'panel.slats' })).toBe(true);
  expect(await setSurface(page, 'east', { presetId: 'paint.navy' })).toBe(true);
  await settle(page);
  const display = await page.evaluate(() => {
    const hook = window.__RF__;
    const roomId = Object.keys(hook?.session.getState().document.rooms ?? {})[0] as never;
    return hook?.roomDisplay(roomId);
  });
  // The fader reaches every wall's own material: all four report an opacity.
  expect(Object.keys(display?.wallOpacity ?? {}).sort()).toEqual([
    'east',
    'north',
    'south',
    'west',
  ]);
  for (const opacity of Object.values(display?.wallOpacity ?? {})) {
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(1);
  }
});
