/**
 * Theme preference logic (DESIGN_SYSTEM §1/§2). Pure functions; the browser glue lives in
 * `use-theme.ts` and the pre-paint script in `public/theme-init.js` (which mirrors
 * `resolveTheme` — theme.test.ts keeps both in sync).
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rf.theme';
/** Dark is the default (the editor looks best in dark and RGB lights stand out). */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'dark';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveTheme(preference: ThemePreference, prefersLight: boolean): ResolvedTheme {
  if (preference === 'system') return prefersLight ? 'light' : 'dark';
  return preference;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Storage can throw (private mode, blocked site data): never let that break rendering. */
export function readThemePreference(storage?: StorageLike): ThemePreference {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeThemePreference(preference: ThemePreference, storage?: StorageLike): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Preference simply will not persist.
  }
}
