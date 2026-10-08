'use client';

import { useEffect } from 'react';

/** True when keyboard input is going into a text field, where shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * `[` toggles the left panel and `]` the right one (DESIGN_SYSTEM §4 area shortcuts).
 * Interim implementation: P3-08 replaces it with the data-driven ShortcutRegistry.
 */
export function usePanelHotkeys(handlers: { left: () => void; right: () => void }) {
  const { left, right } = handlers;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === '[') {
        event.preventDefault();
        left();
      } else if (event.key === ']') {
        event.preventDefault();
        right();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [left, right]);
}
