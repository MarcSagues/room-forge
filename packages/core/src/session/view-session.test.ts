import { describe, expect, it, vi } from 'vitest';
import { buildDocument, createFakeClock, createFixtureCatalog, createSeqIdGen } from '../testing';
import { createEditorSession } from './session';
import type { Command } from './types';
import { VIEW_MODES } from './view';

function setup() {
  return createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
    idGen: createSeqIdGen('new'),
    clock: createFakeClock(1000),
  });
}

const setAmbient = (ambient: number): Command => ({
  type: 'test/setAmbient',
  label: 'Set ambient',
  apply(draft) {
    draft.lighting.ambient = ambient;
  },
});

describe('view state (session-only, never undoable)', () => {
  it('offers a perspective and a top view, starting in perspective', () => {
    expect(VIEW_MODES).toEqual(['perspective', 'top']);
    expect(setup().getState().view).toBe('perspective');
  });

  it('switches view and emits view:changed with the new mode', () => {
    const session = setup();
    const changed = vi.fn();
    session.on('view:changed', changed);

    session.setView('top');

    expect(session.getState().view).toBe('top');
    expect(changed).toHaveBeenCalledExactlyOnceWith({ view: 'top' });
  });

  it('ignores a request for the current view', () => {
    const session = setup();
    const changed = vi.fn();
    const stateChanged = vi.fn();
    session.on('view:changed', changed);
    session.store.subscribe(stateChanged);

    session.setView('perspective');

    expect(changed).not.toHaveBeenCalled();
    expect(stateChanged).not.toHaveBeenCalled();
  });

  it('does not create history entries nor touch the document', () => {
    const session = setup();
    const before = session.getState();

    session.setView('top');

    const after = session.getState();
    expect(after.document).toBe(before.document);
    expect(after.history).toBe(before.history);
    expect(session.undo()).toBe(false);
  });

  it('survives undo, redo and document changes', () => {
    const session = setup();
    session.execute(setAmbient(0.5));
    session.setView('top');

    session.execute(setAmbient(0.6));
    session.undo();
    session.redo();

    expect(session.getState().view).toBe('top');
  });
});
