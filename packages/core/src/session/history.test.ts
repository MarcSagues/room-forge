import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectId, RoomId } from '../domain';
import { buildDocument, createFakeClock, createFixtureCatalog, createSeqIdGen } from '../testing';
import { createEditorSession } from './session';
import type { Command } from './types';

const DESK = 'desk-1' as ObjectId;
const ROOM = 'room-1' as RoomId;

function setup(options: { historyLimit?: number } = {}) {
  const clock = createFakeClock(0);
  const session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
    idGen: createSeqIdGen('new'),
    clock,
    ...options,
  });
  return { session, clock };
}

// ── Example commands ────────────────────────────────────────────

const setAmbient = (ambient: number): Command => ({
  type: 'test/setAmbient',
  label: 'Change ambient light',
  mergeKey: 'lighting:ambient',
  apply(draft) {
    draft.lighting.ambient = ambient;
  },
});

const moveDesk = (x: number): Command => ({
  type: 'test/moveDesk',
  label: 'Move desk',
  mergeKey: `move:${DESK}`,
  apply(draft) {
    const desk = draft.objects[DESK];
    if (!desk) return { code: 'not-found', message: 'No desk' };
    desk.transform.position[0] = x;
  },
});

const renameRoom = (name: string): Command => ({
  type: 'test/renameRoom',
  label: 'Rename room',
  apply(draft) {
    const room = draft.rooms[ROOM];
    if (room) room.name = name;
  },
});

const toggleMode: Command = {
  type: 'test/toggleMode',
  label: 'Day / night',
  apply(draft) {
    draft.lighting.mode = draft.lighting.mode === 'day' ? 'night' : 'day';
  },
};

const addChair = (x: number, z: number): Command => ({
  type: 'test/addChair',
  label: 'Add chair',
  apply(draft, ctx) {
    const id = ctx.idGen() as ObjectId;
    draft.objects[id] = {
      id,
      catalogId: 'chair.office',
      roomId: ROOM,
      parentId: null,
      transform: { position: [x, 0, z], rotationY: 0 },
      materials: {},
      locked: false,
      hidden: false,
    };
    draft.objectOrder.push(id);
  },
});

const removeLastObject: Command = {
  type: 'test/removeLast',
  label: 'Remove object',
  apply(draft) {
    const id = draft.objectOrder.pop();
    if (id) delete draft.objects[id]; // removing the desk orphans the monitor → rejected (I1)
  },
};

// ── Unit tests ──────────────────────────────────────────────────

describe('EditorSession undo/redo', () => {
  it('undoes and redoes a command, publishing each step', () => {
    const { session } = setup();
    const original = session.getState().document;
    const changed = vi.fn();
    session.on('document:changed', changed);

    session.execute(renameRoom('Office'));
    const renamed = session.getState().document;

    expect(session.undo()).toBe(true);
    expect(session.getState().document).toEqual(original);
    expect(changed).toHaveBeenLastCalledWith({
      source: 'undo',
      patches: [{ op: 'replace', path: ['rooms', ROOM, 'name'], value: 'Room' }],
    });

    expect(session.redo()).toBe(true);
    expect(session.getState().document).toEqual(renamed);
    expect(changed.mock.calls.at(-1)?.[0].source).toBe('redo');
  });

  it('returns false when there is nothing to undo or redo', () => {
    const { session } = setup();
    expect(session.undo()).toBe(false);
    expect(session.redo()).toBe(false);
  });

  it('does not record rejected or no-op commands', () => {
    const { session } = setup();
    session.execute(moveDesk(-5)); // breaks I3
    session.execute(moveDesk(2)); // already at x = 2
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('drops the redo branch when a new command runs after undo', () => {
    const { session } = setup();
    session.execute(renameRoom('A'));
    session.execute(renameRoom('B'));
    session.undo();
    expect(session.getState().history.canRedo).toBe(true);
    session.execute(toggleMode);
    expect(session.getState().history.canRedo).toBe(false);
  });

  it('keeps history status in the store and emits history:changed when it changes', () => {
    const { session } = setup();
    const onHistory = vi.fn();
    session.on('history:changed', onHistory);

    session.execute(renameRoom('Office'));
    expect(session.getState().history).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: 'Rename room',
      redoLabel: null,
    });
    expect(onHistory).toHaveBeenCalledTimes(1);

    session.execute(renameRoom('Studio')); // same status → no event
    expect(onHistory).toHaveBeenCalledTimes(1);

    session.undo();
    expect(onHistory).toHaveBeenLastCalledWith({
      canUndo: true,
      canRedo: true,
      undoLabel: 'Rename room',
      redoLabel: 'Rename room',
    });
  });

  it('respects the configured history limit', () => {
    const { session } = setup({ historyLimit: 2 });
    for (const name of ['A', 'B', 'C']) session.execute(renameRoom(name));
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(false);
    expect(session.getState().document.rooms[ROOM]?.name).toBe('A');
  });
});

describe('coalescing by mergeKey', () => {
  it('merges three quick commands into one entry', () => {
    const { session, clock } = setup();
    session.execute(moveDesk(2.1));
    clock.advance(200);
    session.execute(moveDesk(2.2));
    clock.advance(200);
    session.execute(moveDesk(2.3));

    expect(session.undo()).toBe(true);
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(2);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('keeps commands more than 600 ms apart as separate entries', () => {
    const { session, clock } = setup();
    session.execute(moveDesk(2.1));
    clock.advance(601);
    session.execute(moveDesk(2.2));
    session.undo();
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(2.1);
    expect(session.getState().history.canUndo).toBe(true);
  });
});

describe('gestures', () => {
  it('groups five commands into one entry and one document:changed on commit', () => {
    const { session } = setup();
    const before = session.getState().document;
    const changed = vi.fn();
    const stored = vi.fn();
    session.on('document:changed', changed);
    session.store.subscribe(stored);

    const gesture = session.beginGesture('Place desk kit');
    session.execute(addChair(1, 2.5));
    session.execute(addChair(3, 2.5));
    session.execute(moveDesk(2.2));
    session.execute(toggleMode);
    session.execute(renameRoom('Studio'));

    expect(session.getState().document).toBe(before); // nothing published yet
    expect(changed).not.toHaveBeenCalled();
    expect(stored).not.toHaveBeenCalled();

    expect(gesture.commit().ok).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(stored).toHaveBeenCalledTimes(1);
    expect(session.getState().history.undoLabel).toBe('Place desk kit');

    session.undo();
    expect(session.getState().document).toEqual(before);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('lets later commands in a gesture build on earlier ones', () => {
    const { session } = setup();
    const gesture = session.beginGesture('Swap');
    session.execute(toggleMode);
    session.execute(toggleMode);
    session.execute(toggleMode);
    gesture.commit();
    expect(session.getState().document.lighting.mode).toBe('night');
  });

  it('cancel discards the changes without an entry or an event', () => {
    const { session } = setup();
    const before = session.getState().document;
    const changed = vi.fn();
    const ended = vi.fn();
    session.on('document:changed', changed);
    session.on('gesture:ended', ended);

    const gesture = session.beginGesture('Drag');
    session.execute(moveDesk(2.5));
    gesture.cancel();

    expect(session.getState().document).toBe(before);
    expect(session.getState().history.canUndo).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledWith({ label: 'Drag', committed: false });
  });

  it('keeps going after a rejected command and commits only the valid ones', () => {
    const { session } = setup();
    const gesture = session.beginGesture('Mixed');
    expect(session.execute(moveDesk(-5)).ok).toBe(false);
    session.execute(renameRoom('Ok'));
    gesture.commit();
    expect(session.getState().document.rooms[ROOM]?.name).toBe('Ok');
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(2);
  });

  it('records nothing for an empty gesture', () => {
    const { session } = setup();
    session.beginGesture('Nothing').commit();
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('allows one gesture at a time and blocks undo/redo while open', () => {
    const { session } = setup();
    session.execute(renameRoom('A'));
    const gesture = session.beginGesture('Outer');
    expect(() => session.beginGesture('Inner')).toThrow(/already open/);
    expect(session.undo()).toBe(false);
    gesture.commit();
    expect(() => gesture.cancel()).toThrow(/no longer open/);
    expect(session.undo()).toBe(true);
  });

  it('announces gesture start and end', () => {
    const { session } = setup();
    const started = vi.fn();
    const ended = vi.fn();
    session.on('gesture:started', started);
    session.on('gesture:ended', ended);
    session.beginGesture('Drag').commit();
    expect(started).toHaveBeenCalledWith({ label: 'Drag' });
    expect(ended).toHaveBeenCalledWith({ label: 'Drag', committed: true });
  });
});

// ── Property ────────────────────────────────────────────────────

type Step =
  | { kind: 'command'; command: Command; wait: number }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'gesture'; commands: Command[]; cancel: boolean };

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  fc.double({ min: 0, max: 1, noNaN: true }).map(setAmbient),
  fc.double({ min: 0, max: 4, noNaN: true }).map(moveDesk), // some fall outside the room
  fc.string({ maxLength: 10 }).map(renameRoom),
  fc.constant(toggleMode),
  fc
    .tuple(fc.double({ min: 0, max: 4, noNaN: true }), fc.double({ min: 0, max: 3, noNaN: true }))
    .map(([x, z]) => addChair(x, z)),
  fc.constant(removeLastObject),
);

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant('command' as const),
      command: commandArb,
      wait: fc.integer({ min: 0, max: 1000 }),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'undo' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'redo' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('gesture' as const),
      commands: fc.array(commandArb, { maxLength: 5 }),
      cancel: fc.boolean(),
    }),
  },
);

describe('history properties', () => {
  it('undo to the start restores the original; redo to the end restores the final state', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 30 }), (steps) => {
        const { session, clock } = setup({ historyLimit: 1000 });
        const original = structuredCopy(session.getState().document);

        for (const step of steps) {
          if (step.kind === 'command') {
            clock.advance(step.wait);
            session.execute(step.command);
          } else if (step.kind === 'undo') session.undo();
          else if (step.kind === 'redo') session.redo();
          else {
            const gesture = session.beginGesture('Gesture');
            for (const command of step.commands) session.execute(command);
            if (step.cancel) gesture.cancel();
            else gesture.commit();
          }
        }
        // Undone steps at the end are part of the redo branch: bring them back first.
        while (session.redo());
        const final = structuredCopy(session.getState().document);

        while (session.undo());
        expect(session.getState().document).toEqual(original);
        while (session.redo());
        expect(session.getState().document).toEqual(final);
      }),
      { numRuns: 1000 },
    );
  });
});

/** Deep copy through JSON: documents are plain data. */
function structuredCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
