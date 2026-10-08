import { describe, expect, it, vi } from 'vitest';
import type { ObjectId, OpeningId, RoomId, SceneDocument } from '../domain';
import {
  buildDocument,
  buildObject,
  createFakeClock,
  createFixtureCatalog,
  createSeqIdGen,
} from '../testing';
import { createEditorSession } from './session';
import type { Command } from './types';

const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;
const DOOR = 'door-1' as OpeningId;
const ROOM = 'room-1' as RoomId;
const GHOST = 'ghost' as ObjectId;

function setup(initialDocument: SceneDocument = buildDocument()) {
  return createEditorSession({
    initialDocument,
    catalog: createFixtureCatalog(),
    idGen: createSeqIdGen('new'),
    clock: createFakeClock(1000),
  });
}

const removeObject = (id: ObjectId): Command => ({
  type: 'test/removeObject',
  label: 'Remove object',
  apply(draft) {
    delete draft.objects[id];
    draft.objectOrder = draft.objectOrder.filter((other) => other !== id);
  },
});

const addObject = (id: string): Command => ({
  type: 'test/addObject',
  label: 'Add object',
  apply(draft) {
    const object = buildObject({ id });
    draft.objects[object.id] = object;
    draft.objectOrder.push(object.id);
  },
});

const moveDesk = (x: number): Command => ({
  type: 'test/moveDesk',
  label: 'Move desk',
  apply(draft) {
    const desk = draft.objects[DESK];
    if (desk) desk.transform.position[0] = x;
  },
});

describe('session-only state', () => {
  it('starts with nothing selected, nothing hovered and the select tool', () => {
    const state = setup().getState();
    expect(state.selection).toEqual([]);
    expect(state.hover).toBeNull();
    expect(state.activeTool).toBe('select');
  });
});

describe('EditorSession.select', () => {
  it('replaces, adds and toggles, emitting selection:changed with the new ids', () => {
    const session = setup();
    const changed = vi.fn();
    session.on('selection:changed', changed);

    session.select([DESK]);
    session.select([MONITOR], 'add');
    session.select([DESK], 'toggle');
    session.select([DOOR]);

    expect(changed.mock.calls.map(([payload]) => payload.ids)).toEqual([
      [DESK],
      [DESK, MONITOR],
      [MONITOR],
      [DOOR],
    ]);
    expect(session.getState().selection).toEqual([DOOR]);
  });

  it('does nothing (no event, no store update) when the selection would not change', () => {
    const session = setup();
    session.select([DESK, MONITOR]);
    const changed = vi.fn();
    const stored = vi.fn();
    session.on('selection:changed', changed);
    session.store.subscribe(stored);

    session.select([DESK, MONITOR]);
    session.select([MONITOR], 'add');
    session.select([GHOST], 'add');
    session.select([GHOST], 'toggle');

    expect(changed).not.toHaveBeenCalled();
    expect(stored).not.toHaveBeenCalled();
  });

  it('ignores ids that do not exist', () => {
    const session = setup();
    session.select([GHOST, DESK]);
    expect(session.getState().selection).toEqual([DESK]);
  });

  it('replacing with only unknown ids (or with nothing) clears the selection', () => {
    const session = setup();
    session.select([DESK]);
    session.select([GHOST]);
    expect(session.getState().selection).toEqual([]);
    session.select([DESK]);
    session.select([]);
    expect(session.getState().selection).toEqual([]);
  });

  it('supports selecting several entities of different kinds', () => {
    const session = setup();
    session.select([DESK, DOOR, ROOM]);
    expect(session.getState().selection).toEqual([DESK, DOOR, ROOM]);
  });

  it('is not part of the history: it neither changes it nor can it be undone', () => {
    const session = setup();
    const history = vi.fn();
    const document = vi.fn();
    session.on('history:changed', history);
    session.on('document:changed', document);

    session.select([DESK]);

    expect(history).not.toHaveBeenCalled();
    expect(document).not.toHaveBeenCalled();
    expect(session.getState().history.canUndo).toBe(false);
    expect(session.undo()).toBe(false);
    expect(session.getState().selection).toEqual([DESK]);
  });

  it('survives commands, undo and redo that keep the selected entity alive', () => {
    const session = setup();
    session.select([DESK]);
    const changed = vi.fn();
    session.on('selection:changed', changed);

    session.execute(moveDesk(3));
    session.undo();
    session.redo();

    expect(session.getState().selection).toEqual([DESK]);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('selection reconciliation', () => {
  it('clears the selection and emits selection:changed when a selected object is deleted', () => {
    const session = setup();
    session.select([MONITOR]);
    const changed = vi.fn();
    session.on('selection:changed', changed);

    const result = session.execute(removeObject(MONITOR));

    expect(result.ok).toBe(true);
    expect(session.getState().selection).toEqual([]);
    expect(changed).toHaveBeenCalledExactlyOnceWith({ ids: [] });
  });

  it('keeps the surviving part of a multi-selection', () => {
    const session = setup();
    session.select([DESK, MONITOR, DOOR]);
    session.execute(removeObject(MONITOR));
    expect(session.getState().selection).toEqual([DESK, DOOR]);
  });

  it('drops an entity when undo makes it disappear, and does not bring it back on redo', () => {
    const session = setup();
    session.execute(addObject('new-1'));
    const created = 'new-1' as ObjectId;
    session.select([created]);

    session.undo();
    expect(session.getState().selection).toEqual([]);

    session.redo();
    expect(session.getState().document.objects[created]).toBeDefined();
    expect(session.getState().selection).toEqual([]);
  });

  it('emits document:changed, then history:changed, then selection:changed', () => {
    const session = setup();
    session.select([MONITOR]);
    const order: string[] = [];
    session.on('document:changed', () => order.push('document:changed'));
    session.on('history:changed', () => order.push('history:changed'));
    session.on('selection:changed', () => order.push('selection:changed'));

    session.execute(removeObject(MONITOR));

    expect(order).toEqual(['document:changed', 'history:changed', 'selection:changed']);
  });

  it('exposes the already-reconciled selection to document:changed listeners', () => {
    const session = setup();
    session.select([MONITOR]);
    let seen: readonly string[] | undefined;
    session.on('document:changed', () => {
      seen = session.getState().selection;
    });

    session.execute(removeObject(MONITOR));

    expect(seen).toEqual([]);
  });

  it('leaves the selection alone when a command is rejected', () => {
    const session = setup();
    session.select([DESK]);
    const orphan: Command = {
      type: 'test/orphan',
      label: 'Orphan the monitor',
      apply(draft) {
        delete draft.objects[DESK]; // children would be left without a parent (invariant I1)
        draft.objectOrder = draft.objectOrder.filter((id) => id !== DESK);
      },
    };

    const result = session.execute(orphan);

    expect(result.ok).toBe(false);
    expect(session.getState().selection).toEqual([DESK]);
  });
});

describe('hover', () => {
  it('tracks the hovered entity and ignores unknown ids', () => {
    const session = setup();
    session.setHover(DESK);
    expect(session.getState().hover).toBe(DESK);
    session.setHover(GHOST);
    expect(session.getState().hover).toBeNull();
  });

  it('is cleared when the hovered entity is deleted', () => {
    const session = setup();
    session.setHover(MONITOR);
    session.execute(removeObject(MONITOR));
    expect(session.getState().hover).toBeNull();
  });

  it('does not notify the store when nothing changes', () => {
    const session = setup();
    session.setHover(DESK);
    const stored = vi.fn();
    session.store.subscribe(stored);
    session.setHover(DESK);
    expect(stored).not.toHaveBeenCalled();
  });
});

describe('active tool', () => {
  it('switches tools without touching the document or the history', () => {
    const session = setup();
    const before = session.getState();
    session.setActiveTool('place');
    const after = session.getState();
    expect(after.activeTool).toBe('place');
    expect(after.document).toBe(before.document);
    expect(after.history).toBe(before.history);
  });

  it('does not notify the store when the tool is already active', () => {
    const session = setup();
    const stored = vi.fn();
    session.store.subscribe(stored);
    session.setActiveTool('select');
    expect(stored).not.toHaveBeenCalled();
  });
});
