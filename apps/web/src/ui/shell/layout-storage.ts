import type { LayoutStorage } from 'react-resizable-panels';

export const SHELL_LAYOUT_ID = 'rf.shell.layout';

/**
 * `localStorage` that never throws (private mode, blocked site data, server render): when it is
 * unavailable the panels simply start at their default widths and do not persist.
 */
export const safeLayoutStorage: LayoutStorage = {
  getItem(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Not persisted.
    }
  },
};
