/** Where the panel keeps the favourites and recent items: `localStorage`, or a stand-in in tests. */
export interface CatalogPrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CatalogPrefs {
  /** Starred item ids, in the order they were starred. */
  favorites: readonly string[];
  /** Recently placed item ids, the latest first. */
  recent: readonly string[];
}

export const CATALOG_PREFS_KEY = 'rf.catalog.prefs';
export const MAX_FAVORITES = 100;
export const MAX_RECENT = 8;
const MAX_ID_LENGTH = 100;

export const NO_PREFS: CatalogPrefs = { favorites: [], recent: [] };

const ids = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string =>
              typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH,
          ),
        ),
      ].slice(0, max)
    : [];

/**
 * What the storage holds was written by this app but may be damaged or edited: anything that is
 * not a list of short ids is dropped. Storage that throws (private mode, blocked site data) is
 * treated as empty.
 */
export function loadCatalogPrefs(storage: CatalogPrefsStorage | undefined): CatalogPrefs {
  try {
    const raw = storage?.getItem(CATALOG_PREFS_KEY);
    if (!raw || raw.length > 20_000) return NO_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return NO_PREFS;
    const { favorites, recent } = parsed as Record<string, unknown>;
    return { favorites: ids(favorites, MAX_FAVORITES), recent: ids(recent, MAX_RECENT) };
  } catch {
    return NO_PREFS;
  }
}

/** Best effort: when the storage refuses, the preferences last for this visit only. */
export function saveCatalogPrefs(storage: CatalogPrefsStorage | undefined, prefs: CatalogPrefs) {
  try {
    storage?.setItem(CATALOG_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not persisted.
  }
}

export function toggleFavorite(prefs: CatalogPrefs, id: string): CatalogPrefs {
  const favorites = prefs.favorites.includes(id)
    ? prefs.favorites.filter((favorite) => favorite !== id)
    : [...prefs.favorites, id].slice(-MAX_FAVORITES);
  return { ...prefs, favorites };
}

export function recordPlaced(prefs: CatalogPrefs, id: string): CatalogPrefs {
  const recent = [id, ...prefs.recent.filter((other) => other !== id)].slice(0, MAX_RECENT);
  return { ...prefs, recent };
}

/** The browser's `localStorage`, or nothing where reading it throws. */
export function defaultCatalogStorage(): CatalogPrefsStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
