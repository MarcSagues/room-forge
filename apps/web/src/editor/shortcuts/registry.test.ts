import { describe, expect, it, vi } from 'vitest';
import {
  createShortcutRegistry,
  formatCombo,
  isTypingTarget,
  type KeyCombo,
  type ShortcutDef,
} from './registry';

interface Press {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  target?: EventTarget | null;
}

function press(init: Press): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: init.key,
    code: init.code ?? '',
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
    repeat: init.repeat ?? false,
    cancelable: true,
    bubbles: true,
  });
  if (init.target) Object.defineProperty(event, 'target', { value: init.target });
  return event;
}

const def = (id: string, keys: KeyCombo[], extra: Partial<ShortcutDef> = {}): ShortcutDef => ({
  id,
  keys,
  category: 'edit',
  description: `shortcut.${id}`,
  handler: vi.fn(),
  ...extra,
});

describe('ShortcutRegistry: matching', () => {
  it('runs the handler of the shortcut whose key was pressed, and claims the key', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const fit = def('fit', [{ key: 'f' }]);
    registry.register(fit);
    const event = press({ key: 'f' });
    expect(registry.handle(event)).toBe(true);
    expect(fit.handler).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(true);
    const other = press({ key: 'g' });
    expect(registry.handle(other)).toBe(false);
    expect(other.defaultPrevented).toBe(false);
  });

  it('matches letters in either case, and the physical key for digits (any layout)', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const w = def('walls', [{ key: 'w' }]);
    const top = def('top', [{ code: ['Digit2', 'Numpad2'] }]);
    registry.register(w);
    registry.register(top);
    expect(registry.handle(press({ key: 'W' }))).toBe(true);
    expect(registry.handle(press({ key: 'é', code: 'Digit2' }))).toBe(true); // AZERTY
    expect(registry.handle(press({ key: '2', code: 'Numpad2' }))).toBe(true);
    expect(w.handler).toHaveBeenCalledOnce();
    expect(top.handler).toHaveBeenCalledTimes(2);
  });

  it('wants exactly the modifiers it names: F does not fire for Ctrl+F or Shift+F', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const fit = def('fit', [{ key: 'f' }]);
    registry.register(fit);
    expect(registry.handle(press({ key: 'f', ctrlKey: true }))).toBe(false);
    expect(registry.handle(press({ key: 'F', shiftKey: true }))).toBe(false);
    expect(registry.handle(press({ key: 'f', altKey: true }))).toBe(false);
    expect(registry.handle(press({ key: 'f', metaKey: true }))).toBe(false);
    expect(fit.handler).not.toHaveBeenCalled();
  });

  it('mod is Ctrl on Windows and Linux and ⌘ on macOS, never both', () => {
    for (const isMac of [false, true]) {
      const registry = createShortcutRegistry({ isMac });
      const undo = def('undo', [{ mod: true, key: 'z' }]);
      registry.register(undo);
      expect(registry.handle(press({ key: 'z', ctrlKey: !isMac, metaKey: isMac }))).toBe(true);
      expect(registry.handle(press({ key: 'z', ctrlKey: isMac, metaKey: !isMac }))).toBe(false);
      expect(registry.handle(press({ key: 'z', ctrlKey: true, metaKey: true }))).toBe(false);
      expect(registry.handle(press({ key: 'z' }))).toBe(false);
      expect(undo.handler).toHaveBeenCalledOnce();
    }
  });

  it('Ctrl+Z and Ctrl+Shift+Z are different shortcuts; Ctrl+Y redoes on every platform', () => {
    const registry = createShortcutRegistry({ isMac: true });
    const undo = def('undo', [{ mod: true, key: 'z' }]);
    const redo = def('redo', [
      { mod: true, shift: true, key: 'z' },
      { ctrl: true, key: 'y' },
    ]);
    registry.register(undo);
    registry.register(redo);
    registry.handle(press({ key: 'z', metaKey: true }));
    registry.handle(press({ key: 'Z', metaKey: true, shiftKey: true }));
    registry.handle(press({ key: 'y', ctrlKey: true }));
    expect(undo.handler).toHaveBeenCalledTimes(1);
    expect(redo.handler).toHaveBeenCalledTimes(2);
  });

  it('shift: "any" lets symbols that need Shift on some layouts match', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const help = def('help', [{ key: '?', shift: 'any' }]);
    registry.register(help);
    expect(registry.handle(press({ key: '?', shiftKey: true }))).toBe(true);
    expect(registry.handle(press({ key: '?' }))).toBe(true);
    expect(help.handler).toHaveBeenCalledTimes(2);
  });

  it('ignores a held key unless the shortcut asks for repeats', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const once = def('once', [{ key: 'a' }]);
    const again = def('again', [{ key: 'b' }], { repeat: true });
    registry.register(once);
    registry.register(again);
    registry.handle(press({ key: 'a', repeat: true }));
    registry.handle(press({ key: 'b', repeat: true }));
    expect(once.handler).not.toHaveBeenCalled();
    expect(again.handler).toHaveBeenCalledOnce();
  });

  it('leaves a key alone when the shortcut is not enabled, so the browser keeps it', () => {
    const registry = createShortcutRegistry({ isMac: false });
    let enabled = false;
    const del = def('delete', [{ key: 'Delete' }], { enabled: () => enabled });
    registry.register(del);
    const idle = press({ key: 'Delete' });
    expect(registry.handle(idle)).toBe(false);
    expect(idle.defaultPrevented).toBe(false);
    enabled = true;
    expect(registry.handle(press({ key: 'Delete' }))).toBe(true);
  });

  it('skips events that were already handled or that belong to an input method', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const fit = def('fit', [{ key: 'f' }]);
    registry.register(fit);
    const handled = press({ key: 'f' });
    handled.preventDefault();
    expect(registry.handle(handled)).toBe(false);
    const composing = new KeyboardEvent('keydown', {
      key: 'f',
      isComposing: true,
      cancelable: true,
    });
    expect(registry.handle(composing)).toBe(false);
  });
});

describe('ShortcutRegistry: where keys are ignored', () => {
  it('does nothing while typing in a field, but not on a button', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const fit = def('fit', [{ key: 'f' }]);
    registry.register(fit);
    for (const tag of ['input', 'textarea', 'select']) {
      expect(registry.handle(press({ key: 'f', target: document.createElement(tag) }))).toBe(false);
    }
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(registry.handle(press({ key: 'f', target: editable }))).toBe(false);
    expect(fit.handler).not.toHaveBeenCalled();
    expect(registry.handle(press({ key: 'f', target: document.createElement('button') }))).toBe(
      true,
    );
  });

  it('Ctrl+Z inside a field stays with the field (the browser undoes the typing)', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const undo = def('undo', [{ mod: true, key: 'z' }]);
    registry.register(undo);
    const event = press({ key: 'z', ctrlKey: true, target: document.createElement('input') });
    expect(registry.handle(event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores keys pressed inside a dialog', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const fit = def('fit', [{ key: 'f' }]);
    registry.register(fit);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = dialog.appendChild(document.createElement('button'));
    expect(registry.handle(press({ key: 'f', target: button }))).toBe(false);
  });

  it('a shortcut can opt in to work inside fields', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const save = def('save', [{ mod: true, key: 's' }], { inInput: true });
    registry.register(save);
    expect(
      registry.handle(press({ key: 's', ctrlKey: true, target: document.createElement('input') })),
    ).toBe(true);
  });
});

describe('isTypingTarget', () => {
  it('is true for text fields and editable content only', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('ShortcutRegistry: registering', () => {
  it('lists what is registered, in order, and forgets what is unregistered', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const stopA = registry.register(def('a', [{ key: 'a' }]));
    registry.register(def('b', [{ key: 'b' }]));
    expect(registry.list().map((entry) => entry.id)).toEqual(['a', 'b']);
    stopA();
    expect(registry.list().map((entry) => entry.id)).toEqual(['b']);
    expect(registry.handle(press({ key: 'a' }))).toBe(false);
  });

  it('refuses a duplicate id and two shortcuts on the same keys', () => {
    const registry = createShortcutRegistry({ isMac: false });
    registry.register(def('a', [{ key: 'a' }]));
    expect(() => registry.register(def('a', [{ key: 'x' }]))).toThrow(/already registered/);
    expect(() => registry.register(def('b', [{ key: 'A' }]))).toThrow(/conflicts with "a"/);
    // The same key with different modifiers is fine.
    expect(() => registry.register(def('c', [{ mod: true, key: 'a' }]))).not.toThrow();
    // Physical and typed keys for the same thing do conflict.
    registry.register(def('one', [{ code: 'Digit1' }]));
    expect(() => registry.register(def('uno', [{ code: ['Digit1', 'Numpad1'] }]))).toThrow(
      /conflicts/,
    );
    // "any" shift overlaps with both.
    registry.register(def('q', [{ key: '?', shift: 'any' }]));
    expect(() => registry.register(def('q2', [{ key: '?', shift: true }]))).toThrow(/conflicts/);
  });

  it('registers several at once and unregisters them together', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const stop = registry.registerAll([def('a', [{ key: 'a' }]), def('b', [{ key: 'b' }])]);
    expect(registry.list()).toHaveLength(2);
    stop();
    expect(registry.list()).toHaveLength(0);
  });

  it('a failed registerAll leaves nothing behind', () => {
    const registry = createShortcutRegistry({ isMac: false });
    expect(() =>
      registry.registerAll([def('a', [{ key: 'a' }]), def('b', [{ key: 'a' }])]),
    ).toThrow();
    expect(registry.list()).toHaveLength(0);
  });

  it('attaches to a window and detaches again', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const fit = def('fit', [{ key: 'f' }]);
    registry.register(fit);
    const stop = registry.attach(window);
    window.dispatchEvent(press({ key: 'f' }));
    expect(fit.handler).toHaveBeenCalledOnce();
    stop();
    window.dispatchEvent(press({ key: 'f' }));
    expect(fit.handler).toHaveBeenCalledOnce();
  });
});

describe('formatCombo', () => {
  it('writes Ctrl, Shift, Alt and the key on Windows and Linux', () => {
    expect(formatCombo({ mod: true, key: 'z' }, false)).toEqual(['Ctrl', 'Z']);
    expect(formatCombo({ mod: true, shift: true, key: 'z' }, false)).toEqual([
      'Ctrl',
      'Shift',
      'Z',
    ]);
    expect(formatCombo({ ctrl: true, key: 'y' }, false)).toEqual(['Ctrl', 'Y']);
    expect(formatCombo({ alt: true, key: 'f' }, false)).toEqual(['Alt', 'F']);
  });

  it('uses the Mac symbols on macOS', () => {
    expect(formatCombo({ mod: true, key: 'z' }, true)).toEqual(['⌘', 'Z']);
    expect(formatCombo({ mod: true, shift: true, key: 'z' }, true)).toEqual(['⇧', '⌘', 'Z']);
    expect(formatCombo({ ctrl: true, key: 'y' }, true)).toEqual(['⌃', 'Y']);
    expect(formatCombo({ alt: true, key: 'f' }, true)).toEqual(['⌥', 'F']);
  });

  it('names special keys and shows digits for physical keys', () => {
    expect(formatCombo({ key: 'Delete' }, false)).toEqual(['Del']);
    expect(formatCombo({ key: 'Escape' }, false)).toEqual(['Esc']);
    expect(formatCombo({ key: 'Backspace' }, false)).toEqual(['⌫']);
    expect(formatCombo({ key: '?', shift: 'any' }, false)).toEqual(['?']);
    expect(formatCombo({ code: ['Digit1', 'Numpad1'] }, false)).toEqual(['1']);
    expect(formatCombo({ key: '[' }, false)).toEqual(['[']);
  });
});
