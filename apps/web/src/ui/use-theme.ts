'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_THEME_PREFERENCE,
  type ResolvedTheme,
  readThemePreference,
  resolveTheme,
  type ThemePreference,
  writeThemePreference,
} from './theme';

const CHANGE_EVENT = 'rf:theme-change';
const LIGHT_QUERY = '(prefers-color-scheme: light)';

function subscribe(onChange: () => void) {
  const media = window.matchMedia(LIGHT_QUERY);
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  media.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
    media.removeEventListener('change', onChange);
  };
}

function applyToDocument(resolved: ResolvedTheme) {
  document.documentElement.dataset.theme = resolved;
}

export function useTheme() {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribe,
    readThemePreference,
    () => DEFAULT_THEME_PREFERENCE,
  );
  const prefersLight = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(LIGHT_QUERY).matches,
    () => false,
  );
  const resolved = resolveTheme(preference, prefersLight);

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    applyToDocument(resolveTheme(next, window.matchMedia(LIGHT_QUERY).matches));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { preference, resolved, setPreference };
}
