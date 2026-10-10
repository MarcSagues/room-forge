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
  return existsSync(path) ? glbStats(readFileSync(path)) : undefined;
}

describe('the shipped catalog manifest', () => {
  it('is valid: schema, unique ids, real files with the stats it declares, budgets, licences', () => {
    expect(validateCatalogManifest(manifest, measure)).toEqual([]);
  });

  it('holds the nine own models (ADR-0007), all under the ADR budget', () => {
    expect(manifest.items).toHaveLength(9);
    const { triangles, bytes } = DEFAULT_CATALOG_POLICY.budgets.default;
    for (const item of manifest.items) {
      expect(item.license.spdx).toBe(OWN_LICENSE);
      expect(item.source.triangles).toBeLessThanOrEqual(triangles);
      expect(item.source.bytes).toBeLessThanOrEqual(bytes);
      expect(item.slots.length, item.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('names items without brands', () => {
    const text = manifest.items.map((item) => `${item.name.en} ${item.name.es}`).join(' ');
    expect(text).not.toMatch(/\b(ikea|herman|steelcase|secretlab|dxracer|lg|samsung|dell)\b/i);
  });
});

describe('glbStats', () => {
  it('counts the triangles of a real model', () => {
    const stats = glbStats(readFileSync(`${assets}models/monitor.27.flat.glb`));
    expect(stats.triangles).toBe(1320);
    expect(stats.bytes).toBeGreaterThan(1000);
  });

  it('refuses what is not a GLB, or is cut short', () => {
    expect(() => glbStats(new TextEncoder().encode('{"asset":{}} padding pad'))).toThrow(
      'Not a GLB',
    );
    const model = readFileSync(`${assets}models/monitor.27.flat.glb`);
    expect(() => glbStats(model.subarray(0, 100))).toThrow('Truncated');
  });
});
