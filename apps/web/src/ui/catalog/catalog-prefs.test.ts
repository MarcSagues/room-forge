import { describe, expect, it } from 'vitest';
import {
  CATALOG_PREFS_KEY,
  type CatalogPrefsStorage,
  loadCatalogPrefs,
  MAX_RECENT,
  NO_PREFS,
  recordPlaced,
  saveCatalogPrefs,
  toggleFavorite,
} from './catalog-prefs';

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};
const throwing: CatalogPrefsStorage = {
  getItem: () => {
    throw new DOMException('blocked', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('full', 'QuotaExceededError');
  },
};

describe('catalog preferences', () => {
  it('round-trips through the storage', () => {
    const storage = memory();
    const prefs = recordPlaced(toggleFavorite(NO_PREFS, 'desk'), 'chair');
    saveCatalogPrefs(storage, prefs);
    expect(loadCatalogPrefs(storage)).toEqual({ favorites: ['desk'], recent: ['chair'] });
  });

  it('starts empty without storage, with storage that throws, or with damaged data', () => {
    expect(loadCatalogPrefs(undefined)).toEqual(NO_PREFS);
    expect(loadCatalogPrefs(throwing)).toEqual(NO_PREFS);
    for (const raw of ['{', 'null', '[]', '"x"', 'x'.repeat(30_000)]) {
      expect(loadCatalogPrefs(memory({ [CATALOG_PREFS_KEY]: raw }))).toEqual(NO_PREFS);
    }
    expect(() => saveCatalogPrefs(throwing, NO_PREFS)).not.toThrow();
  });

  it('keeps only short, distinct string ids', () => {
    const raw = JSON.stringify({
      favorites: ['desk', 'desk', 3, '', 'x'.repeat(200), 'lamp'],
      recent: 'chair',
    });
    expect(loadCatalogPrefs(memory({ [CATALOG_PREFS_KEY]: raw }))).toEqual({
      favorites: ['desk', 'lamp'],
      recent: [],
    });
  });

  it('toggles a favourite on and off', () => {
    const on = toggleFavorite(NO_PREFS, 'desk');
    expect(on.favorites).toEqual(['desk']);
    expect(toggleFavorite(on, 'desk').favorites).toEqual([]);
  });

  it('keeps the latest placements first, without repeats, up to the limit', () => {
    let prefs = NO_PREFS;
    for (const id of ['a', 'b', 'a', 'c']) prefs = recordPlaced(prefs, id);
    expect(prefs.recent).toEqual(['c', 'a', 'b']);
    for (let i = 0; i < 20; i += 1) prefs = recordPlaced(prefs, `item${i}`);
    expect(prefs.recent).toHaveLength(MAX_RECENT);
    expect(prefs.recent[0]).toBe('item19');
  });
});
