/**
 * Keyboard shortcuts as data (DESIGN_SYSTEM §4, P3-08): every module registers what it can do, one
 * listener runs them, and the help dialog lists whatever is registered. Pure TypeScript: no React,
 * no DOM beyond reading key events.
 */

/** One key combination. Name the key by what it types (`key`) or by where it is (`code`). */
export interface KeyCombo {
  /** The character or name the key produces (`z`, `[`, `?`, `Delete`); letters match in any case. */
  key?: string;
  /** Physical key(s) (`Digit1`, `Numpad1`): they match whatever the layout types. */
  code?: string | readonly string[];
  /** Ctrl on Windows and Linux, ⌘ on macOS. */
  mod?: boolean;
  /** Literally Ctrl, on every platform (e.g. Ctrl+Y for redo). */
  ctrl?: boolean;
  /** `true` = required, `false`/absent = must not be down, `'any'` = do not care (symbols). */
  shift?: boolean | 'any';
  alt?: boolean;
}

export interface ShortcutDef {
  /** Unique and stable: `edit.undo`. */
  id: string;
  keys: readonly KeyCombo[];
  /** Section of the help dialog. */
  category: string;
  /** Message key of the description; the ui translates it. */
  description: string;
  handler(event: KeyboardEvent): void;
  /** When it returns false the key is left alone, for the browser (nothing to delete...). */
  enabled?(): boolean;
  /** Run again while the key is held (undo, redo). */
  repeat?: boolean;
  /** Also run while typing in a text field (rare: a field owns its keys). */
  inInput?: boolean;
}

export interface ShortcutRegistry {
  readonly isMac: boolean;
  /** Returns the function that unregisters it. Throws on a repeated id or a clash of keys. */
  register(def: ShortcutDef): () => void;
  /** All or nothing: if one fails, none stays registered. */
  registerAll(defs: readonly ShortcutDef[]): () => void;
  /** What is registered, in registration order. */
  list(): readonly ShortcutDef[];
  /** Runs the shortcut for a key event, if any; true when one ran (and the key was claimed). */
  handle(event: KeyboardEvent): boolean;
  /** Listens for `keydown` on `target` (the window); returns the cleanup. */
  attach(target: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void;
}

/** True on macOS and iOS-like platforms, where ⌘ replaces Ctrl. */
export function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** True when keyboard input is going into a text field, where shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Keys pressed inside a dialog belong to the dialog. */
function insideDialog(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('[role="dialog"], [aria-modal="true"]') !== null
  );
}

const codes = (combo: KeyCombo): readonly string[] =>
  combo.code === undefined ? [] : typeof combo.code === 'string' ? [combo.code] : combo.code;

function matches(combo: KeyCombo, event: KeyboardEvent, isMac: boolean): boolean {
  const byCode = combo.code !== undefined && codes(combo).includes(event.code);
  const byKey = combo.key !== undefined && event.key.toLowerCase() === combo.key.toLowerCase();
  if (!byCode && !byKey) return false;
  const wantsCtrl = Boolean(combo.ctrl) || (Boolean(combo.mod) && !isMac);
  const wantsMeta = Boolean(combo.mod) && isMac;
  if (event.ctrlKey !== wantsCtrl || event.metaKey !== wantsMeta) return false;
  if (event.altKey !== Boolean(combo.alt)) return false;
  return combo.shift === 'any' || event.shiftKey === Boolean(combo.shift);
}

function clash(a: KeyCombo, b: KeyCombo, isMac: boolean): boolean {
  const sameKey =
    (a.key !== undefined && b.key !== undefined && a.key.toLowerCase() === b.key.toLowerCase()) ||
    codes(a).some((code) => codes(b).includes(code));
  if (!sameKey) return false;
  const ctrl = (c: KeyCombo) => Boolean(c.ctrl) || (Boolean(c.mod) && !isMac);
  const meta = (c: KeyCombo) => Boolean(c.mod) && isMac;
  if (ctrl(a) !== ctrl(b) || meta(a) !== meta(b) || Boolean(a.alt) !== Boolean(b.alt)) return false;
  return a.shift === 'any' || b.shift === 'any' || Boolean(a.shift) === Boolean(b.shift);
}

export function createShortcutRegistry(options: { isMac?: boolean } = {}): ShortcutRegistry {
  const isMac = options.isMac ?? detectMac();
  let defs: readonly ShortcutDef[] = [];

  const register = (def: ShortcutDef) => {
    if (defs.some((other) => other.id === def.id)) {
      throw new Error(`Shortcut "${def.id}" is already registered`);
    }
    for (const other of defs) {
      const conflicting = def.keys.some((a) => other.keys.some((b) => clash(a, b, isMac)));
      if (conflicting) {
        throw new Error(`Shortcut "${def.id}" conflicts with "${other.id}": same keys`);
      }
    }
    defs = [...defs, def];
    return () => {
      defs = defs.filter((other) => other !== def);
    };
  };

  const handle = (event: KeyboardEvent): boolean => {
    if (event.defaultPrevented || event.isComposing) return false;
    const blocked = isTypingTarget(event.target) || insideDialog(event.target);
    for (const def of defs) {
      if (blocked && !def.inInput) continue;
      if (!def.keys.some((combo) => matches(combo, event, isMac))) continue;
      if (event.repeat && !def.repeat) continue;
      if (def.enabled && !def.enabled()) continue;
      event.preventDefault();
      def.handler(event);
      return true;
    }
    return false;
  };

  return {
    isMac,
    register,
    registerAll(list) {
      const stops: (() => void)[] = [];
      try {
        for (const def of list) stops.push(register(def));
      } catch (error) {
        for (const stop of stops) stop();
        throw error;
      }
      return () => {
        for (const stop of stops) stop();
      };
    },
    list: () => defs,
    handle,
    attach(target) {
      const onKeyDown = (event: Event) => {
        handle(event as KeyboardEvent);
      };
      target.addEventListener('keydown', onKeyDown);
      return () => target.removeEventListener('keydown', onKeyDown);
    },
  };
}

const SPECIAL_KEYS: Readonly<Record<string, string>> = {
  delete: 'Del',
  escape: 'Esc',
  backspace: '⌫',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: 'Enter',
};

/** A combo as the parts of a label: `['Ctrl', 'Shift', 'Z']`, or `['⇧', '⌘', 'Z']` on macOS. */
export function formatCombo(combo: KeyCombo, isMac: boolean): string[] {
  const parts: string[] = [];
  const ctrl = Boolean(combo.ctrl) || (Boolean(combo.mod) && !isMac);
  const meta = Boolean(combo.mod) && isMac;
  if (isMac) {
    // Apple's order: Control, Option, Shift, Command.
    if (ctrl) parts.push('⌃');
    if (combo.alt) parts.push('⌥');
    if (combo.shift === true) parts.push('⇧');
    if (meta) parts.push('⌘');
  } else {
    if (ctrl) parts.push('Ctrl');
    if (combo.alt) parts.push('Alt');
    if (combo.shift === true) parts.push('Shift');
  }
  const first = codes(combo)[0];
  if (first !== undefined) parts.push(first.replace(/^(Digit|Numpad|Key)/, ''));
  else if (combo.key !== undefined) {
    parts.push(SPECIAL_KEYS[combo.key.toLowerCase()] ?? combo.key.toUpperCase());
  }
  return parts;
}
