import type { CatalogManifest } from '@roomforge/core';
import { describe, expect, it } from 'vitest';
import { createManifestCatalog, modelCatalog } from './manifest-catalog';

const slot = (id: string, tint: `#${string}`) => ({
  id,
  label: { en: id, es: id },
  default: { presetId: 'paint.satin', tint },
});

const license = {
  spdx: 'LicenseRef-RoomForge-Proprietary',
  author: 'RoomForge',
  origin: 'test',
  attribution: 'test',
};

const sample: CatalogManifest = {
  version: 1,
  items: [
    {
      id: 'desk.a',
      name: { en: 'Desk A', es: 'Escritorio A' },
      category: 'desk',
      tags: ['desk', 'gaming'],
      size: { w: 1.4, h: 0.75, d: 0.7 },
      placement: { surfaces: ['floor'] },
      slots: [slot('top', '#aabbcc'), slot('frame', '#000000')],
      source: { kind: 'glb', file: 'models/desk.a.glb', triangles: 10, bytes: 100 },
      license,
    },
    {
      id: 'chair.b',
      name: { en: 'Chair B', es: 'Silla B' },
      category: 'seating',
      tags: ['chair', 'gaming'],
      size: { w: 0.6, h: 1.2, d: 0.6 },
      placement: { surfaces: ['floor'] },
      slots: [],
      source: { kind: 'glb', file: 'models/chair.b.glb', triangles: 10, bytes: 100 },
      license,
    },
  ],
};

describe('createManifestCatalog', () => {
  const catalog = createManifestCatalog(sample, '/base/');

  it('gives core each item by id, with its size, placement and slots', () => {
    expect(catalog.getItem('desk.a')).toEqual({
      id: 'desk.a',
      size: { w: 1.4, h: 0.75, d: 0.7 },
      placement: { surfaces: ['floor'] },
      slots: [
        { id: 'top', default: { presetId: 'paint.satin', tint: '#aabbcc' } },
        { id: 'frame', default: { presetId: 'paint.satin', tint: '#000000' } },
      ],
    });
    expect(catalog.getItem('nope')).toBeUndefined();
    expect(catalog.entry('chair.b')?.name.es).toBe('Silla B');
  });

  it('finds items by category and by tag', () => {
    expect(catalog.byCategory('seating').map((item) => item.id)).toEqual(['chair.b']);
    expect(catalog.byCategory('lighting')).toEqual([]);
    expect(catalog.byTag('gaming').map((item) => item.id)).toEqual(['desk.a', 'chair.b']);
  });

  it('tells the scene the placeholder colour and where the model is', () => {
    expect(catalog.colorOf('desk.a')).toBe('#aabbcc');
    expect(catalog.colorOf('chair.b')).toBeUndefined();
    expect(catalog.modelUrlOf('desk.a')).toBe('/base/models/desk.a.glb');
    expect(catalog.modelUrlOf('nope')).toBeUndefined();
  });
});

describe('modelCatalog', () => {
  it('is the shipped manifest', () => {
    expect(modelCatalog.entries()).toHaveLength(9);
    expect(modelCatalog.getItem('desk.office.140')?.size).toEqual({ w: 1.4, h: 0.74, d: 0.7 });
    expect(modelCatalog.byCategory('computing')).toHaveLength(3);
    expect(modelCatalog.modelUrlOf('chair.gaming.racing')).toBe(
      '/assets/models/chair.gaming.racing.glb',
    );
  });
});
