import {
  createEditorSession,
  type EditorSession,
  moveObjects,
  type ObjectId,
} from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { editorShortcuts } from './editor-shortcuts';
import { createShortcutRegistry, type ShortcutRegistry } from './registry';

// Fixture room 4 × 3; desk-1 at (2, 0, 1.5) with monitor-1 standing on it.
const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;

let session: EditorSession;
let registry: ShortcutRegistry;
let fit: ReturnType<typeof vi.fn<() => void>>;

function press(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget | null = null,
): boolean {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  if (target) Object.defineProperty(event, 'target', { value: target });
  return registry.handle(event);
}

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  fit = vi.fn<() => void>();
  registry = createShortcutRegistry({ isMac: false });
  registry.registerAll(editorShortcuts({ session, fit }));
});

const objectIds = () => Object.keys(session.getState().document.objects);

describe('editor shortcuts: history', () => {
  beforeEach(() => {
    session.execute(moveObjects([{ id: DESK, position: [3, 0, 1.5] }]));
  });

  it('Ctrl+Z undoes and Ctrl+Shift+Z or Ctrl+Y redo', () => {
    expect(press('z', { ctrlKey: true })).toBe(true);
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(2);
    expect(press('Z', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(3);
    press('z', { ctrlKey: true });
    expect(press('y', { ctrlKey: true })).toBe(true);
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(3);
  });

  it('⌘+Z does the same on macOS', () => {
    registry = createShortcutRegistry({ isMac: true });
    registry.registerAll(editorShortcuts({ session, fit }));
    expect(press('z', { metaKey: true })).toBe(true);
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(2);
    expect(press('z', { ctrlKey: true })).toBe(false);
  });

  it('leaves the key alone when there is nothing to undo or redo', () => {
    press('z', { ctrlKey: true });
    expect(press('z', { ctrlKey: true })).toBe(false);
    press('y', { ctrlKey: true });
    expect(press('y', { ctrlKey: true })).toBe(false);
  });

  it('does not undo while typing in a field: the field undoes its own typing', () => {
    expect(press('z', { ctrlKey: true }, document.createElement('input'))).toBe(false);
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(3);
  });
});

describe('editor shortcuts: the selection', () => {
  it('Delete and Backspace remove the selected objects (and what stands on them)', () => {
    session.select([DESK]);
    expect(press('Delete')).toBe(true);
    expect(objectIds()).toEqual([]);
    expect(press('Delete')).toBe(false); // nothing selected any more

    setup2();
    session.select([DESK]);
    expect(press('Backspace')).toBe(true);
    expect(objectIds()).toEqual([]);
  });

  it('does nothing without a selection', () => {
    expect(press('Delete')).toBe(false);
    expect(objectIds()).toHaveLength(2);
  });

  it('Ctrl+D duplicates the selection and selects the copy', () => {
    session.select([DESK]);
    expect(press('d', { ctrlKey: true })).toBe(true);
    expect(objectIds().length).toBeGreaterThan(2);
    const [copy] = session.getState().selection;
    expect(copy).toBeDefined();
    expect(copy).not.toBe(DESK);
    expect(session.getState().document.objects[copy as ObjectId]?.catalogId).toBe('desk.basic.120');
    expect(session.getState().history.undoLabel).toBe('Duplicate object');
  });

  it('Escape clears the selection, and is left alone when there is none', () => {
    session.select([DESK, MONITOR]);
    expect(press('Escape')).toBe(true);
    expect(session.getState().selection).toEqual([]);
    expect(press('Escape')).toBe(false);
  });
});

describe('editor shortcuts: the view', () => {
  it('1 and 2 switch between perspective and top, on the digit row or the numpad', () => {
    expect(press('2', { code: 'Digit2' })).toBe(true);
    expect(session.getState().view).toBe('top');
    expect(press('1', { code: 'Numpad1' })).toBe(true);
    expect(session.getState().view).toBe('perspective');
  });

  it('F frames the room', () => {
    expect(press('f')).toBe(true);
    expect(fit).toHaveBeenCalledOnce();
  });

  it('W cycles the walls and C toggles the ceiling', () => {
    const before = session.getState().wallMode;
    expect(press('w')).toBe(true);
    expect(session.getState().wallMode).not.toBe(before);
    const ceiling = session.getState().showCeiling;
    expect(press('c')).toBe(true);
    expect(session.getState().showCeiling).toBe(!ceiling);
  });

  it('G turns snap off and on again, and is left alone while typing', () => {
    expect(press('g')).toBe(true);
    expect(session.getState().snap.enabled).toBe(false);
    expect(press('G', { shiftKey: true })).toBe(false);
    expect(press('g', {}, document.createElement('input'))).toBe(false);
    expect(press('g')).toBe(true);
    expect(session.getState().snap.enabled).toBe(true);
  });

  it('none of them fires with Ctrl, Alt or Shift (those belong to the browser and later shortcuts)', () => {
    expect(press('f', { ctrlKey: true })).toBe(false);
    expect(press('w', { altKey: true })).toBe(false);
    expect(press('c', { shiftKey: true })).toBe(false);
    expect(fit).not.toHaveBeenCalled();
  });

  it('none of them fires while typing', () => {
    const input = document.createElement('input');
    for (const key of ['f', 'w', 'c']) expect(press(key, {}, input)).toBe(false);
    expect(press('1', { code: 'Digit1' }, input)).toBe(false);
  });
});

describe('editor shortcuts: the list', () => {
  it('describes every shortcut with a message key and a section', () => {
    for (const shortcut of registry.list()) {
      expect(shortcut.description).toMatch(/^shortcut\.[a-z.]+$/i);
      expect(shortcut.category).toMatch(/^[a-z]+$/);
      expect(shortcut.keys.length).toBeGreaterThan(0);
    }
    expect(registry.list().map((shortcut) => shortcut.id)).toEqual([
      'edit.undo',
      'edit.redo',
      'edit.duplicate',
      'edit.delete',
      'edit.snap',
      'selection.clear',
      'view.perspective',
      'view.top',
      'view.fit',
      'view.walls',
      'view.ceiling',
    ]);
  });
});

/** A fresh session, after a test deleted everything. */
function setup2() {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  registry = createShortcutRegistry({ isMac: false });
  registry.registerAll(editorShortcuts({ session, fit }));
}
