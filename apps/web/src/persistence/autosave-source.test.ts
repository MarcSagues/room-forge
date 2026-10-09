import { createEditorSession, createStarterDocument, moveObjects } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { autosaveSourceOf } from './autosave-source';

function setup() {
  const session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  return { session, source: autosaveSourceOf(session) };
}

const DESK = 'desk-1' as never;
// The desk stands at (2, 1.5) in the 4 x 3 m room of the fixture.
const moveBy = (dx: number) => moveObjects([{ id: DESK, position: [2 + dx, 0, 1.5] }]);

describe('autosaveSourceOf (an EditorSession)', () => {
  it('reads the current document, a new object after every change', () => {
    const { session, source } = setup();
    const before = source.document();
    expect(before).toBe(session.getState().document);
    session.execute(moveBy(0.1));
    expect(source.document()).not.toBe(before);
    expect(source.document()).toBe(session.getState().document);
  });

  it('tells about commands, undo and redo', () => {
    const { session, source } = setup();
    const listener = vi.fn();
    source.onChange(listener);
    session.execute(moveBy(0.1));
    expect(listener).toHaveBeenCalledTimes(1);
    session.undo();
    expect(listener).toHaveBeenCalledTimes(2);
    session.redo();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('is not bothered by selection, view or hover, which are never saved', () => {
    const { session, source } = setup();
    const listener = vi.fn();
    source.onChange(listener);
    session.select([DESK]);
    session.setHover(DESK);
    session.setView('top');
    session.setShowCeiling(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('hears a gesture once, when it ends, not on every step of it', () => {
    const { session, source } = setup();
    const listener = vi.fn();
    source.onChange(listener);
    const gesture = session.beginGesture('Move');
    for (let i = 0; i < 20; i += 1) session.execute(moveBy(0.01 * (i + 1)));
    expect(listener).not.toHaveBeenCalled();
    gesture.commit();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a cancelled gesture is nothing to save', () => {
    const { session, source } = setup();
    const listener = vi.fn();
    source.onChange(listener);
    const gesture = session.beginGesture('Move');
    session.execute(moveBy(0.5));
    gesture.cancel();
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops listening when told to', () => {
    const { session, source } = setup();
    const listener = vi.fn();
    const stop = source.onChange(listener);
    stop();
    session.execute(moveBy(0.1));
    expect(listener).not.toHaveBeenCalled();
    expect(session.getState().document).toBeDefined();
  });

  it('works with the starter document of a new project too', () => {
    const session = createEditorSession({
      initialDocument: createStarterDocument(),
      catalog: createFixtureCatalog(),
    });
    expect(autosaveSourceOf(session).document().roomOrder).toHaveLength(1);
  });
});
