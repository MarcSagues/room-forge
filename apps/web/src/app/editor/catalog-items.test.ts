import { describe, expect, it } from 'vitest';
import { CATALOG_CATEGORY_OPTIONS, CATALOG_ITEMS, categoriesOf } from './catalog-items';

describe('catalog panel items', () => {
  it('offers the categories the manifest and the stubs use, in the schema order', () => {
    expect(CATALOG_CATEGORY_OPTIONS).toEqual([
      { id: 'desk', label: 'Desks' },
      { id: 'seating', label: 'Seating' },
      { id: 'storage', label: 'Storage' },
      { id: 'computing', label: 'Computing' },
      { id: 'lighting', label: 'Lighting' },
      { id: 'decor', label: 'Decor' },
    ]);
    expect(categoriesOf([])).toEqual([]);
  });

  it('gives a model its thumbnail, category, and Spanish name, tags and category as keywords', () => {
    const lamp = CATALOG_ITEMS.find((item) => item.id === 'lamp.floor.cone');
    expect(lamp).toMatchObject({ category: 'lighting', name: expect.any(String) });
    expect(lamp?.thumbnail).toMatch(
      /^\/assets\/thumbnails\/lamp\.floor\.cone\.[0-9a-f]{10}\.webp$/,
    );
    expect(lamp?.keywords).toEqual(expect.arrayContaining(['lamp', 'Lighting']));
    expect(lamp?.keywords?.some((word) => word.startsWith('Lámpara'))).toBe(true);
  });

  it('leaves a stub box without a thumbnail, and the bed without a category', () => {
    const bed = CATALOG_ITEMS.find((item) => item.id === 'bed.single');
    expect(bed).not.toHaveProperty('thumbnail');
    expect(bed).not.toHaveProperty('category');
    expect(bed?.keywords).toEqual(['Cama individual']);
    expect(CATALOG_ITEMS.find((item) => item.id === 'shelf.tall')?.category).toBe('storage');
  });
});
