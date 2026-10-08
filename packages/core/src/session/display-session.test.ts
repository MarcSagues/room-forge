import { describe, expect, it, vi } from 'vitest';
import { buildDocument, createFixtureCatalog } from '../testing';
import { createEditorSession } from './session';
import { nextWallMode, WALL_MODES } from './view';

const setup = () =>
  createEditorSession({ initialDocument: buildDocument(), catalog: createFixtureCatalog() });

describe('wall mode and ceiling preview (session-only display state)', () => {
  it('starts with cutaway walls and the ceiling hidden for editing', () => {
    const state = setup().getState();
    expect(state.wallMode).toBe('cutaway');
    expect(state.showCeiling).toBe(false);
  });

  it('changes the wall mode and announces it once', () => {
    const session = setup();
    const changed = vi.fn();
    session.on('display:changed', changed);
    session.setWallMode('down');
    session.setWallMode('down');
    expect(session.getState().wallMode).toBe('down');
    expect(changed).toHaveBeenCalledExactlyOnceWith({ wallMode: 'down', showCeiling: false });
  });

  it('toggles the ceiling preview', () => {
    const session = setup();
    const changed = vi.fn();
    session.on('display:changed', changed);
    session.setShowCeiling(true);
    expect(session.getState().showCeiling).toBe(true);
    expect(changed).toHaveBeenCalledWith({ wallMode: 'cutaway', showCeiling: true });
  });

  it('is not part of the history', () => {
    const session = setup();
    session.setWallMode('up');
    session.setShowCeiling(true);
    expect(session.getState().history.canUndo).toBe(false);
    expect(session.undo()).toBe(false);
    expect(session.getState().wallMode).toBe('up');
  });

  it('cycles up → cutaway → down → up', () => {
    expect(WALL_MODES).toEqual(['up', 'cutaway', 'down']);
    expect(nextWallMode('up')).toBe('cutaway');
    expect(nextWallMode('cutaway')).toBe('down');
    expect(nextWallMode('down')).toBe('up');
  });
});
