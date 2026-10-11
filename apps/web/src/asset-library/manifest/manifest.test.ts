// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CATALOG_POLICY, OWN_LICENSE, validateCatalogManifest } from '@roomforge/core';
import { describe, expect, it } from 'vitest';
import { glbStats } from '../testing/glb-stats';
import manifest from './catalog.json';

// `pnpm catalog:validate` runs this file; `pnpm check` runs it with every other test.
const assets = fileURLToPath(new URL('../../../public/assets/', import.meta.url));

function measure(file: string) {
  const path = `${assets}${file}`;
  if (!existsSync(path)) return undefined;
  const bytes = readFileSync(path);
  // Only whether a thumbnail exists counts for the validator.
  return file.endsWith('.webp') ? { triangles: 0, bytes: bytes.length } : glbStats(bytes);
}

/** Width, height and whether it has transparency, from the VP8X header Chromium writes. */
function webpHeader(bytes: Buffer) {
  const text = (start: number, end: number) => bytes.toString('latin1', start, end);
  if (text(0, 4) !== 'RIFF' || text(8, 16) !== 'WEBPVP8X') throw new Error('Not an extended WebP');
  return {
    width: bytes.readUIntLE(24, 3) + 1,
    height: bytes.readUIntLE(27, 3) + 1,
    alpha: ((bytes[20] ?? 0) & 0x10) !== 0,
  };
}

const monitorFile = () => {
  const item = manifest.items.find((entry) => entry.id === 'monitor.27.flat');
  if (!item) throw new Error('monitor.27.flat is not in the manifest');
  return `${assets}${item.source.file}`;
};

describe('the shipped catalog manifest', () => {
  it('is valid: schema, unique ids, real files with the stats it declares, budgets, licences', () => {
    expect(validateCatalogManifest(manifest, measure)).toEqual([]);
  });

  it('holds the fifteen own models (ADR-0007), all under the ADR budget', () => {
    expect(manifest.items).toHaveLength(15);
    const { triangles, bytes } = DEFAULT_CATALOG_POLICY.budgets.default;
    for (const item of manifest.items) {
      expect(item.license.spdx).toBe(OWN_LICENSE);
      expect(item.source.triangles).toBeLessThanOrEqual(triangles);
      expect(item.source.bytes).toBeLessThanOrEqual(bytes);
      expect(item.slots.length, item.id).toBeGreaterThanOrEqual('light' in item ? 2 : 3);
    }
  });

  it('holds six luminaires (P4-10), each with its light budget and one glowing slot', () => {
    // P4-10: strip 2, bars 1, panels 2, lamps 1, neon 1.
    const costs = { strip: 2, bar: 1, panel: 2, point: 1, spot: 1, neon: 1 };
    const lights = manifest.items.filter((item) => item.category === 'lighting');
    expect(lights.map((item) => item.id)).toEqual([
      'led.strip.1m',
      'light.bars.pair',
      'panel.hex.cluster',
      'lamp.floor.cone',
      'lamp.desk.arm',
      'neon.sign.wave',
    ]);
    for (const item of lights) {
      if (!('light' in item)) throw new Error(`${item.id} has no light`);
      expect(item.light.cost, item.id).toBe(costs[item.light.kind as keyof typeof costs]);
      const glowing = item.slots.filter((slot) => 'emissive' in slot && slot.emissive);
      expect(glowing.map((slot) => slot.default.tint)).toEqual([item.light.defaultColor]);
      // Until surface placement (P3-13) the editor puts everything on the floor.
      expect(item.placement.surfaces[0]).toBe('floor');
    }
  });

  it('gives every model a content-hashed file and a 256 px transparent WebP thumbnail (P4-03)', () => {
    for (const item of manifest.items) {
      const pattern = (folder: string, extension: string) =>
        new RegExp(`^${folder}/${item.id.replaceAll('.', '\\.')}\\.[0-9a-f]{10}\\.${extension}$`);
      expect(item.source.file).toMatch(pattern('models', 'glb'));
      expect(item.thumbnail).toMatch(pattern('thumbnails', 'webp'));
      const picture = readFileSync(`${assets}${item.thumbnail}`);
      expect(webpHeader(picture), item.id).toEqual({ width: 256, height: 256, alpha: true });
      expect(picture.length, item.id).toBeLessThan(20_000);
    }
  });

  it('names items without brands', () => {
    const text = manifest.items.map((item) => `${item.name.en} ${item.name.es}`).join(' ');
    expect(text).not.toMatch(/\b(ikea|herman|steelcase|secretlab|dxracer|lg|samsung|dell)\b/i);
  });
});

describe('glbStats', () => {
  it('counts the triangles of a real model', () => {
    const stats = glbStats(readFileSync(monitorFile()));
    expect(stats.triangles).toBe(1320);
    expect(stats.bytes).toBeGreaterThan(1000);
  });

  it('refuses what is not a GLB, or is cut short', () => {
    expect(() => glbStats(new TextEncoder().encode('{"asset":{}} padding pad'))).toThrow(
      'Not a GLB',
    );
    const model = readFileSync(monitorFile());
    expect(() => glbStats(model.subarray(0, 100))).toThrow('Truncated');
  });
});
