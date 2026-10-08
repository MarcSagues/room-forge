'use client';

import { useSyncExternalStore } from 'react';

/**
 * How the editor shell lays itself out (DESIGN_SYSTEM §3 "Responsive"):
 * - `full`    ≥ 1024 px: side panels docked and resizable (narrower defaults below 1280 px).
 * - `compact` 768–1023 px: panels become drawers over the viewport.
 * - `viewer`  < 768 px: viewport only plus a banner (mobile is view-only in the MVP).
 */
export type ShellMode = 'full' | 'compact' | 'viewer';

export const SHELL_BREAKPOINTS = { viewer: 768, full: 1024, wide: 1280 } as const;

const QUERIES = {
  full: `(min-width: ${SHELL_BREAKPOINTS.full}px)`,
  compact: `(min-width: ${SHELL_BREAKPOINTS.viewer}px)`,
  wide: `(min-width: ${SHELL_BREAKPOINTS.wide}px)`,
} as const;

export function shellModeForWidth(width: number): ShellMode {
  if (width >= SHELL_BREAKPOINTS.full) return 'full';
  if (width >= SHELL_BREAKPOINTS.viewer) return 'compact';
  return 'viewer';
}

function subscribe(onChange: () => void) {
  const lists = Object.values(QUERIES).map((q) => window.matchMedia(q));
  for (const list of lists) list.addEventListener('change', onChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}

// A single string snapshot keeps useSyncExternalStore stable ("full:wide" etc.).
function getSnapshot(): string {
  const mode: ShellMode = window.matchMedia(QUERIES.full).matches
    ? 'full'
    : window.matchMedia(QUERIES.compact).matches
      ? 'compact'
      : 'viewer';
  return `${mode}:${window.matchMedia(QUERIES.wide).matches ? 'wide' : 'narrow'}`;
}

export function useShellMode(): { mode: ShellMode; wide: boolean } {
  // The editor is client-only (ADR-0002), so the server snapshot is never used for hydration.
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => 'full:wide');
  const [mode, width] = snapshot.split(':') as [ShellMode, 'wide' | 'narrow'];
  return { mode, wide: width === 'wide' };
}
