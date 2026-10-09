import { describe, expect, it, vi } from 'vitest';
import type { ObjectId } from '../domain';
import { buildDocument, createFakeClock, createFixtureCatalog, createSeqIdGen } from '../testing';
import { createEditorSession } from './session';
import type { Command } from './types';

const DESK = 'desk-1' as ObjectId;

const moveDesk = (x: number): Command => ({
  type: 'test/moveDesk',
  label: 'Move desk',
  apply(draft) {
    const desk = draft.objects[DESK];
    if (desk) desk.transform.position[0] = x;
  },
});

function setup() {
  return createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
    idGen: createSeqIdGen('new'),
    clock: createFakeClock(1000),
  });
}

const deskX = (session: ReturnType<typeof setup>) =>
  session.getState().document.objects[DESK]?.transform.position[0];

describe('EditorSession read-only mode', () => {
  it('starts editable', () => {
    expect(setup().getState().readOnly).toBe(false);
  });

  it('rejects commands without changing the document or the history', () => {
    const session = setup();
    const changed = vi.fn();
    session.on('document:changed', changed);
    session.setReadOnly(true);
    const before = session.getState().document;

    const result = session.execute(moveDesk(2.5));

    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'read-only' }) });
    expect(session.getState().document).toBe(before);
    expect(session.getState().history.canUndo).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });

  it('blocks undo and redo, and allows them again once editable', () => {
    const session = setup();
    session.execute(moveDesk(2.5));
    session.setReadOnly(true);

    expect(session.undo()).toBe(false);
    expect(deskX(session)).toBe(2.5);

    session.setReadOnly(false);
    expect(session.undo()).toBe(true);
    expect(session.redo()).toBe(true);
    expect(deskX(session)).toBe(2.5);
  });

  it('drops a gesture that was open when the mode turned read-only', () => {
    const session = setup();
    const changed = vi.fn();
    session.on('document:changed', changed);
    const gesture = session.beginGesture('Drag desk');
    session.execute(moveDesk(2.5));
    session.setReadOnly(true);

    const result = gesture.commit();

    expect(result.ok).toBe(false);
    expect(deskX(session)).toBe(2);
    expect(changed).not.toHaveBeenCalled();
    // The gesture is closed: a new one may begin.
    expect(() => session.beginGesture('Next').cancel()).not.toThrow();
  });

  it('notifies store subscribers only when the mode changes', () => {
    const session = setup();
    const listener = vi.fn();
    session.store.subscribe(listener);
    session.setReadOnly(true);
    session.setReadOnly(true);
    session.setReadOnly(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
