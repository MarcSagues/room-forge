import { afterEach, describe, expect, it, vi } from 'vitest';
import { installHotkeys, resolveHotkey } from './hotkeys';

interface PressInit {
  code: string;
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  target?: EventTarget | null;
}

const press = (init: PressInit) => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  target: null,
  ...init,
});

describe('resolveHotkey', () => {
  it('maps 1 and 2 to the perspective and top views, on the main row and the numpad', () => {
    expect(resolveHotkey(press({ code: 'Digit1', key: '1' }))).toEqual({
      type: 'view',
      view: 'perspective',
    });
    expect(resolveHotkey(press({ code: 'Digit2', key: '2' }))).toEqual({
      type: 'view',
      view: 'top',
    });
    expect(resolveHotkey(press({ code: 'Numpad2', key: '2' }))).toEqual({
      type: 'view',
      view: 'top',
    });
  });

  it('resolves digits by physical key so other layouts (AZERTY) still work', () => {
    expect(resolveHotkey(press({ code: 'Digit1', key: '&' }))).toEqual({
      type: 'view',
      view: 'perspective',
    });
  });

  it('maps W to cycling the walls and C to the ceiling preview', () => {
    expect(resolveHotkey(press({ code: 'KeyW', key: 'w' }))).toEqual({ type: 'cycleWalls' });
    expect(resolveHotkey(press({ code: 'KeyW', key: 'W' }))).toEqual({ type: 'cycleWalls' });
    expect(resolveHotkey(press({ code: 'KeyC', key: 'c' }))).toEqual({ type: 'toggleCeiling' });
    // Ctrl/Cmd+C stays with the browser (copy).
    expect(resolveHotkey(press({ code: 'KeyC', key: 'c', ctrlKey: true }))).toBeNull();
  });

  it('maps Escape to clearing the selection, but not while typing', () => {
    expect(resolveHotkey(press({ code: 'Escape', key: 'Escape' }))).toEqual({ type: 'deselect' });
    const input = document.createElement('input');
    expect(resolveHotkey(press({ code: 'Escape', key: 'Escape', target: input }))).toBeNull();
  });

  it('maps F to fit, whatever the letter case', () => {
    expect(resolveHotkey(press({ code: 'KeyF', key: 'f' }))).toEqual({ type: 'fit' });
    expect(resolveHotkey(press({ code: 'KeyF', key: 'F' }))).toEqual({ type: 'fit' });
  });

  it('ignores keys with no action', () => {
    expect(resolveHotkey(press({ code: 'KeyQ', key: 'q' }))).toBeNull();
    expect(resolveHotkey(press({ code: 'Digit9', key: '9' }))).toBeNull();
  });

  it.each(['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const)(
    'leaves browser and future shortcuts alone when %s is held',
    (modifier) => {
      expect(resolveHotkey(press({ code: 'Digit2', key: '2', [modifier]: true }))).toBeNull();
    },
  );

  it('ignores auto-repeat so holding a key does not spam actions', () => {
    expect(resolveHotkey(press({ code: 'KeyF', key: 'f', repeat: true }))).toBeNull();
  });

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
    [
      'contenteditable element',
      () => {
        const element = document.createElement('div');
        element.contentEditable = 'true';
        Object.defineProperty(element, 'isContentEditable', { value: true });
        return element;
      },
    ],
  ])('does not steal keys typed into a %s', (_name, create) => {
    expect(resolveHotkey(press({ code: 'KeyF', key: 'f', target: create() }))).toBeNull();
  });

  it('still works when the focus is on a button', () => {
    const button = document.createElement('button');
    expect(resolveHotkey(press({ code: 'Digit1', key: '1', target: button }))).not.toBeNull();
  });
});

describe('installHotkeys', () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  const keydown = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    window.dispatchEvent(event);
    return event;
  };

  it('routes views and fit to the handlers and cancels the default action', () => {
    const handlers = {
      setView: vi.fn(),
      fit: vi.fn(),
      cycleWalls: vi.fn(),
      toggleCeiling: vi.fn(),
      deselect: vi.fn(),
    };
    cleanup = installHotkeys(window, handlers);

    const top = keydown({ code: 'Digit2', key: '2' });
    keydown({ code: 'Digit1', key: '1' });
    keydown({ code: 'KeyF', key: 'f' });
    keydown({ code: 'KeyW', key: 'w' });
    keydown({ code: 'KeyC', key: 'c' });
    keydown({ code: 'Escape', key: 'Escape' });

    expect(handlers.setView.mock.calls).toEqual([['top'], ['perspective']]);
    expect(handlers.fit).toHaveBeenCalledOnce();
    expect(handlers.cycleWalls).toHaveBeenCalledOnce();
    expect(handlers.toggleCeiling).toHaveBeenCalledOnce();
    expect(handlers.deselect).toHaveBeenCalledOnce();
    expect(top.defaultPrevented).toBe(true);
  });

  it('does not cancel keys it does not handle', () => {
    cleanup = installHotkeys(window, {
      setView: vi.fn(),
      fit: vi.fn(),
      cycleWalls: vi.fn(),
      toggleCeiling: vi.fn(),
      deselect: vi.fn(),
    });
    expect(keydown({ code: 'KeyQ', key: 'q' }).defaultPrevented).toBe(false);
  });

  it('stops listening after cleanup', () => {
    const handlers = {
      setView: vi.fn(),
      fit: vi.fn(),
      cycleWalls: vi.fn(),
      toggleCeiling: vi.fn(),
      deselect: vi.fn(),
    };
    installHotkeys(window, handlers)();
    keydown({ code: 'KeyF', key: 'f' });
    expect(handlers.fit).not.toHaveBeenCalled();
  });
});
