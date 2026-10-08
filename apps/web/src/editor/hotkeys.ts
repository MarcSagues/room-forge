import type { ViewMode } from '@roomforge/core';

export type HotkeyAction =
  | { type: 'view'; view: ViewMode }
  | { type: 'fit' }
  | { type: 'cycleWalls' }
  | { type: 'toggleCeiling' };

export interface HotkeyHandlers {
  setView(view: ViewMode): void;
  fit(): void;
  cycleWalls(): void;
  toggleCeiling(): void;
}

interface KeyPress {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  target: EventTarget | null;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True when the key was typed into a field: single-letter shortcuts must not steal it. */
function isEditable(target: EventTarget | null): boolean {
  const element = target as Partial<HTMLElement> | null;
  if (!element) return false;
  return (
    (element.tagName !== undefined && EDITABLE_TAGS.has(element.tagName)) ||
    element.isContentEditable === true
  );
}

/**
 * Maps a key press to an editor action. Digits are matched by physical key (`code`) so layouts
 * where they need Shift still work; modified presses are left to the browser and later shortcuts.
 */
export function resolveHotkey(press: KeyPress): HotkeyAction | null {
  if (press.repeat || press.ctrlKey || press.metaKey || press.altKey || press.shiftKey) return null;
  if (isEditable(press.target)) return null;
  switch (press.code) {
    case 'Digit1':
    case 'Numpad1':
      return { type: 'view', view: 'perspective' };
    case 'Digit2':
    case 'Numpad2':
      return { type: 'view', view: 'top' };
  }
  switch (press.key.toLowerCase()) {
    case 'f':
      return { type: 'fit' };
    case 'w':
      return { type: 'cycleWalls' };
    case 'c':
      return { type: 'toggleCeiling' };
    default:
      return null;
  }
}

/** Listens on `target` (the window) and returns the cleanup. */
export function installHotkeys(target: Window, handlers: HotkeyHandlers): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const action = resolveHotkey(event);
    if (!action) return;
    event.preventDefault();
    if (action.type === 'view') handlers.setView(action.view);
    else if (action.type === 'fit') handlers.fit();
    else if (action.type === 'cycleWalls') handlers.cycleWalls();
    else handlers.toggleCeiling();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
