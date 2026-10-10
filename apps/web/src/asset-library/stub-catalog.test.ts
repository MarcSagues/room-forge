import { describe, expect, it } from 'vitest';
import { emptyCatalog, stubCatalog } from './index';
import { stubEntries } from './stub-catalog';

describe('stub catalog (P3-06, replaced by the real manifest in P4-02)', () => {
  const entries = stubEntries();

  it('has five items with unique ids', () => {
    expect(entries).toHaveLength(5);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(5);
  });

  it('names every item in English and Spanish, without a brand', () => {
    for (const { name } of entries) {
      expect(name.en.length).toBeGreaterThan(2);
      expect(name.es.length).toBeGreaterThan(2);
    }
    const text = entries.map((entry) => `${entry.name.en} ${entry.name.es}`).join(' ');
    expect(text).not.toMatch(/ikea|herman|steelcase|secretlab/i);
  });

  it('tells the core each size and that every item stands on the floor', () => {
    for (const entry of entries) {
      const item = stubCatalog.getItem(entry.id);
      expect(item?.id).toBe(entry.id);
      expect(item?.size).toEqual(entry.size);
      expect(item?.placement.surfaces[0]).toBe('floor');
      expect(entry.size.w).toBeGreaterThan(0);
      expect(entry.size.h).toBeGreaterThan(0);
      expect(entry.size.d).toBeGreaterThan(0);
    }
  });

  it('gives every item a colour for its placeholder box', () => {
    for (const entry of entries) {
      expect(entry.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(stubCatalog.colorOf(entry.id)).toBe(entry.color);
    }
    expect(new Set(entries.map((entry) => entry.color)).size).toBe(5);
  });

  it('does not know other ids (invariant I6 keeps them as they are)', () => {
    expect(stubCatalog.getItem('test.box')).toBeUndefined();
    expect(stubCatalog.colorOf('test.box')).toBeUndefined();
  });

  it('every item fits the default demo room (4 × 4.5 m)', () => {
    for (const { size } of entries) {
      expect(Math.max(size.w, size.d)).toBeLessThan(4);
    }
  });

  it('the empty catalog still knows nothing', () => {
    expect(emptyCatalog.getItem(entries[0]?.id ?? '')).toBeUndefined();
  });
});
