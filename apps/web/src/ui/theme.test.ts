import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeThemePreference,
} from './theme';

describe('resolveTheme', () => {
  it('follows the OS only for the "system" preference', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });
});

describe('theme preference storage', () => {
  it('defaults to dark when nothing valid is stored', () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('dark');
    expect(readThemePreference({ getItem: () => null, setItem: () => {} })).toBe('dark');
    expect(readThemePreference({ getItem: () => 'purple', setItem: () => {} })).toBe('dark');
  });

  it('round-trips a valid preference', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    writeThemePreference('light', storage);
    expect(store.get(THEME_STORAGE_KEY)).toBe('light');
    expect(readThemePreference(storage)).toBe('light');
  });

  it('never throws when storage is blocked (private mode, blocked site data)', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readThemePreference(blocked)).toBe('dark');
    expect(() => writeThemePreference('light', blocked)).not.toThrow();
  });

  it('validates preferences', () => {
    expect(['system', 'light', 'dark'].every(isThemePreference)).toBe(true);
    expect(isThemePreference('auto')).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});

// public/theme-init.js runs before first paint and cannot import theme.ts, so it mirrors it.
// This test runs the real script and checks it agrees with the TypeScript logic.
describe('public/theme-init.js stays in sync with theme.ts', () => {
  const script = readFileSync(
    path.resolve(import.meta.dirname, '../../public/theme-init.js'),
    'utf8',
  );

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const stored: Array<string | null> = [null, 'garbage', 'system', 'light', 'dark'];
  for (const value of stored) {
    for (const prefersLight of [true, false]) {
      it(`stored=${value} prefersLight=${prefersLight}`, () => {
        if (value !== null) localStorage.setItem(THEME_STORAGE_KEY, value);
        vi.spyOn(window, 'matchMedia').mockImplementation(
          (query) => ({ matches: prefersLight, media: query }) as MediaQueryList,
        );
        new Function(script)();
        const expected = resolveTheme(readThemePreference(), prefersLight);
        expect(document.documentElement.dataset.theme).toBe(expected);
      });
    }
  }

  it('falls back to dark when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    new Function(script)();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
