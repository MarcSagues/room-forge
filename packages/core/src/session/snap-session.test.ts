import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { ANGLE_STEPS_DEG, GRID_STEPS } from '../geometry';
import { buildDocument, createFixtureCatalog } from '../testing';
import { createEditorSession } from './session';
import { DEFAULT_SNAP, type SnapSettings } from './snap';

const setup = () =>
  createEditorSession({ initialDocument: buildDocument(), catalog: createFixtureCatalog() });

describe('snap settings (session-only state)', () => {
  it('starts on, with a 10 cm grid and 15° turns', () => {
    expect(setup().getState().snap).toEqual({ enabled: true, gridStep: 0.1, angleStepDeg: 15 });
    expect(DEFAULT_SNAP).toEqual({ enabled: true, gridStep: 0.1, angleStepDeg: 15 });
  });

  it('changes only what is given, and announces each change once', () => {
    const session = setup();
    const changed = vi.fn();
    session.on('snap:changed', changed);
    session.setSnap({ gridStep: 0.25 });
    session.setSnap({ gridStep: 0.25 });
    session.setSnap({ enabled: false, angleStepDeg: 90 });
    expect(session.getState().snap).toEqual({ enabled: false, gridStep: 0.25, angleStepDeg: 90 });
    expect(changed).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenLastCalledWith({ enabled: false, gridStep: 0.25, angleStepDeg: 90 });
  });

  it('ignores sizes the snap control does not offer', () => {
    const session = setup();
    session.setSnap({ gridStep: 0.3 as SnapSettings['gridStep'] });
    session.setSnap({ angleStepDeg: 30 as SnapSettings['angleStepDeg'] });
    session.setSnap({ gridStep: Number.NaN as SnapSettings['gridStep'] });
    expect(session.getState().snap).toEqual(DEFAULT_SNAP);
  });

  it('is not part of the history', () => {
    const session = setup();
    session.setSnap({ enabled: false });
    expect(session.getState().history.canUndo).toBe(false);
    expect(session.undo()).toBe(false);
    expect(session.getState().snap.enabled).toBe(false);
  });

  it('always holds one of the offered sizes, whatever is asked for', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record(
            {
              enabled: fc.boolean(),
              gridStep: fc.oneof(fc.constantFrom(...GRID_STEPS), fc.double()),
              angleStepDeg: fc.oneof(fc.constantFrom(...ANGLE_STEPS_DEG), fc.integer()),
            },
            { requiredKeys: [] },
          ),
        ),
        (changes) => {
          const session = setup();
          for (const change of changes) session.setSnap(change as Partial<SnapSettings>);
          const { snap } = session.getState();
          expect(GRID_STEPS).toContain(snap.gridStep);
          expect(ANGLE_STEPS_DEG).toContain(snap.angleStepDeg);
        },
      ),
    );
  });
});
