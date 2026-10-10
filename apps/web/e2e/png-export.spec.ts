import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function openEditor(page: Page) {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
}

const info = (page: Page) => page.evaluate(() => window.__RF__?.info() ?? null);

async function settle(page: Page) {
  let previous = (await info(page))?.frame ?? -1;
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(150);
    const now = (await info(page))?.frame ?? -1;
    if (now === previous) return;
    previous = now;
  }
  throw new Error('the canvas never went idle');
}

async function addBox(page: Page, id: string) {
  await page.evaluate((target) => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    const result = hook.session.execute(
      hook.commands.addObject({
        id: target,
        catalogId: 'test.box',
        roomId,
        position: [2, 0, 2.25],
        rotationY: 0,
      }),
    );
    if (!result.ok) throw new Error(result.error.message);
  }, id);
  await settle(page);
}

type Background = 'As in the viewport' | 'Transparent' | { color: string };

/** Exports through the dialog and returns the downloaded file. */
async function exportPng(
  page: Page,
  options: { scale: 1 | 2; background: Background },
): Promise<{ filename: string; bytes: Buffer }> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Image (.png)…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export image' });
  await dialog.getByRole('radio', { name: new RegExp(`^${options.scale}×`) }).check();
  await dialog.getByRole('radio', { name: 'Draft (fastest, no smoothing)' }).check();
  if (typeof options.background === 'string') {
    await dialog.getByRole('radio', { name: options.background }).check();
  } else {
    await dialog.getByLabel('Background colour').fill(options.background.color);
    await expect(dialog.getByRole('radio', { name: 'Solid colour' })).toBeChecked();
  }
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export PNG' }).click();
  const download = await downloading;
  // SwiftShader renders on the CPU: a large export under a busy runner takes a while.
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const path = await download.path();
  return { filename: download.suggestedFilename(), bytes: readFileSync(path) };
}

const pngSize = (bytes: Buffer) => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

/** Decodes the PNG in the page: its top-left pixel and a hash of every pixel. */
function decode(page: Page, bytes: Buffer) {
  return page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2D context');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let hash = 2166136261;
    let opaque = 0;
    for (let i = 0; i < pixels.length; i += 1) {
      hash = Math.imul(hash ^ (pixels[i] as number), 16777619) >>> 0;
      if (i % 4 === 3 && pixels[i] === 255) opaque += 1;
    }
    return { corner: [...pixels.slice(0, 4)], hash, opaque };
  }, bytes.toString('base64'));
}

test('exports the view as a PNG without the editor overlays, and the view goes on', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openEditor(page);
  await addBox(page, 'box');
  const canvas = await page.locator('main canvas').boundingBox();
  if (!canvas) throw new Error('no canvas');

  // A solid background at 1×: a real PNG, the viewport's size, named after the project and day.
  const solid = await exportPng(page, { scale: 1, background: { color: '#ff00ff' } });
  expect([...solid.bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(solid.filename).toMatch(/^untitled-project-\d{4}-\d\d-\d\d\.png$/);
  expect(pngSize(solid.bytes)).toEqual({
    width: Math.round(canvas.width),
    height: Math.round(canvas.height),
  });
  await expect(page.getByText(`Image saved as ${solid.filename}.`)).toBeVisible();
  const solidPixels = await decode(page, solid.bytes);
  // The room does not reach the top-left corner: the chosen colour is there.
  expect(solidPixels.corner).toEqual([255, 0, 255, 255]);

  // 2× doubles both sides.
  const double = await exportPng(page, { scale: 2, background: 'As in the viewport' });
  expect(pngSize(double.bytes)).toEqual({
    width: Math.round(canvas.width) * 2,
    height: Math.round(canvas.height) * 2,
  });

  // Transparent: real alpha in the empty corner, the room itself opaque.
  const box = await page.evaluate(() => window.__RF__?.project('box' as never) ?? null);
  if (!box) throw new Error('the box is not on screen');
  await page.mouse.click(box.x, box.y);
  await expect
    .poll(() => page.evaluate(() => [...(window.__RF__?.session.getState().selection ?? [])]))
    .toEqual(['box']);
  await settle(page);
  // GPU memory now that the selection's own drawings have been drawn once.
  const baseline = await info(page);
  const selected = await decode(
    page,
    (await exportPng(page, { scale: 1, background: 'Transparent' })).bytes,
  );
  expect(selected.corner[3]).toBe(0);
  expect(selected.opaque).toBeGreaterThan(1000);

  // Without the selection outline, the rotation handle and the hover outline the picture is the
  // same: none of them was in it.
  await page.keyboard.press('Escape');
  await page.mouse.move(canvas.x + 2, canvas.y + 2);
  await expect
    .poll(() => page.evaluate(() => window.__RF__?.session.getState().selection.length))
    .toBe(0);
  await settle(page);
  const plain = await decode(
    page,
    (await exportPng(page, { scale: 1, background: 'Transparent' })).bytes,
  );
  expect(plain.hash).toBe(selected.hash);

  // The live view is unchanged and still draws, and the exports left no GPU memory behind.
  await settle(page);
  const after = await info(page);
  expect(after?.geometries).toBe(baseline?.geometries);
  expect(after?.textures).toBe(baseline?.textures);
  await page.mouse.click(box.x, box.y);
  await expect.poll(async () => (await info(page))?.frame ?? 0).toBeGreaterThan(after?.frame ?? 0);
  expect(errors).toEqual([]);
});
