import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DOOR_HINGES,
  DOOR_SWINGS,
  type OpeningId,
  type RoomId,
  type SceneDocument,
} from '../domain';
import { checkInvariants, createEditorSession } from '../session';
import {
  buildDocument,
  buildObject,
  buildOpening,
  buildRoom,
  createFakeClock,
  createFixtureCatalog,
  createSeqIdGen,
} from '../testing';
import { doorSweepObstacles, setDoorOpen, setDoorSwing, toggleDoor } from './door';
import { addOpening, resizeOpening } from './opening';
import { resizeRoom } from './room';

// Fixture room 4 (x) × 3 (z): door-1 on the south wall (0.5–1.4 along it, i.e. x 2.6–3.5),
// window-1 on the north wall.
const ROOM = 'room-1' as RoomId;
const DOOR = 'door-1' as OpeningId;
const WINDOW = 'window-1' as OpeningId;
const catalog = createFixtureCatalog();

function setup(initialDocument: SceneDocument = buildDocument()) {
  const clock = createFakeClock(0);
  const session = createEditorSession({
    initialDocument,
    catalog,
    idGen: createSeqIdGen('new'),
    clock,
  });
  return { session, clock, doc: () => session.getState().document };
}

describe('opening/add', () => {
  it('creates doors closed, opening inwards and hinged on the left', () => {
    const { session, doc } = setup();
    session.execute(addOpening({ roomId: ROOM, wall: 'east', variant: 'door.double', offset: 1 }));
    expect(doc().openings['new-1' as OpeningId]).toMatchObject({
      kind: 'door',
      swing: 'in',
      hinge: 'left',
      open: 0,
    });
  });

  it('gives windows no door state', () => {
    const { session, doc } = setup();
    session.execute(
      addOpening({ roomId: ROOM, wall: 'east', variant: 'window.standard', offset: 1 }),
    );
    const window = doc().openings['new-1' as OpeningId];
    expect(window).not.toHaveProperty('open');
    expect(window).not.toHaveProperty('swing');
    expect(window).not.toHaveProperty('hinge');
  });
});

describe('opening/setOpen', () => {
  it('opens a door as one undoable history entry', () => {
    const { session, doc } = setup();
    const before = doc();
    const result = session.execute(setDoorOpen(DOOR, 1));
    expect(result.ok).toBe(true);
    expect(doc().openings[DOOR]?.open).toBe(1);
    expect(session.getState().history.undoLabel).toBe('Open door');
    session.undo();
    expect(doc()).toEqual(before);
  });

  it('toggles between closed and fully open', () => {
    const { session, clock, doc } = setup();
    session.execute(toggleDoor(DOOR));
    expect(doc().openings[DOOR]?.open).toBe(1);
    clock.advance(1000);
    session.execute(toggleDoor(DOOR));
    expect(doc().openings[DOOR]?.open).toBe(0);
    session.execute(setDoorOpen(DOOR, 0.4));
    clock.advance(1000);
    session.execute(toggleDoor(DOOR));
    expect(doc().openings[DOOR]?.open).toBe(0);
  });

  it('coalesces repeated toggles of the same door into one entry', () => {
    const { session, clock, doc } = setup();
    const before = doc();
    for (let i = 0; i < 3; i += 1) {
      session.execute(toggleDoor(DOOR));
      clock.advance(100);
    }
    expect(doc().openings[DOOR]?.open).toBe(1);
    expect(session.undo()).toBe(true);
    expect(doc()).toEqual(before);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('rejects windows, unknown ids and values outside 0…1', () => {
    const { session, doc } = setup();
    const before = doc();
    expect(session.execute(setDoorOpen(WINDOW, 1))).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    expect(session.execute(toggleDoor('nope' as OpeningId))).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
    for (const open of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(session.execute(setDoorOpen(DOOR, open)).ok).toBe(false);
    }
    expect(doc()).toBe(before);
  });

  it('is blocked when the leaf would cross the opposite wall', () => {
    // A 2.4 m single door on the 4 m north wall of a room only 2 m deep.
    const room = buildRoom({ shape: { kind: 'rect', width: 4, depth: 2 } });
    const door = buildOpening({ wall: 'north', offset: 0.5, width: 2.4 });
    const { session, doc } = setup({
      ...buildDocument(),
      rooms: { [room.id]: room },
      openings: { [door.id]: door },
      objects: {},
      objectOrder: [],
    });
    expect(session.execute(setDoorOpen(DOOR, 1))).toMatchObject({
      ok: false,
      error: { code: 'blocked' },
    });
    // Ajar is fine (2.4 × sin 45° ≈ 1.7 m), and opening outwards crosses nothing.
    expect(session.execute(setDoorOpen(DOOR, 0.5)).ok).toBe(true);
    expect(session.execute(setDoorSwing(DOOR, { swing: 'out' })).ok).toBe(true);
    expect(session.execute(setDoorOpen(DOOR, 1)).ok).toBe(true);
    // Swinging back in with the door wide open would cross the wall.
    expect(session.execute(setDoorSwing(DOOR, { swing: 'in' }))).toMatchObject({
      ok: false,
      error: { code: 'blocked' },
    });
    expect(doc().openings[DOOR]).toMatchObject({ swing: 'out', open: 1 });
  });

  it('keeps an open door from being widened or the room shrunk across its sweep (I4)', () => {
    const room = buildRoom({ shape: { kind: 'rect', width: 4, depth: 3.2 } });
    const door = buildOpening({ wall: 'north', offset: 0.5, width: 3, open: 1 });
    const { session } = setup({
      ...buildDocument(),
      rooms: { [room.id]: room },
      openings: { [door.id]: door },
      objects: {},
      objectOrder: [],
    });
    expect(session.execute(resizeOpening(DOOR, { width: 3.3 })).ok).toBe(false);
    expect(session.execute(resizeRoom(ROOM, { depth: 2.5 })).ok).toBe(false);
    expect(session.execute(resizeRoom(ROOM, { depth: 3 })).ok).toBe(true);
  });
});

describe('opening/setSwing', () => {
  it('changes swing and hinge as one undoable family', () => {
    const { session, doc } = setup();
    const before = doc();
    expect(session.execute(setDoorSwing(DOOR, { swing: 'out', hinge: 'right' })).ok).toBe(true);
    expect(doc().openings[DOOR]).toMatchObject({ swing: 'out', hinge: 'right' });
    session.undo();
    expect(doc()).toEqual(before);
  });

  it('rejects windows and empty changes', () => {
    const { session } = setup();
    expect(session.execute(setDoorSwing(WINDOW, { hinge: 'right' })).ok).toBe(false);
    expect(session.execute(setDoorSwing(DOOR, {})).ok).toBe(false);
  });
});

describe('door commands (properties)', () => {
  it('never leave the document invalid, and undoing everything restores it', () => {
    const step = fc.oneof(
      fc.record({ kind: fc.constant('open' as const), open: fc.double({ min: -0.5, max: 1.5 }) }),
      fc.record({ kind: fc.constant('toggle' as const) }),
      fc.record({
        kind: fc.constant('swing' as const),
        swing: fc.option(fc.constantFrom(...DOOR_SWINGS), { nil: undefined }),
        hinge: fc.option(fc.constantFrom(...DOOR_HINGES), { nil: undefined }),
      }),
    );
    fc.assert(
      fc.property(
        fc.double({ min: 2, max: 5, noNaN: true }),
        fc.double({ min: 0.6, max: 3, noNaN: true }),
        fc.array(fc.tuple(step, fc.nat(1000)), { maxLength: 12 }),
        (depth, width, steps) => {
          const room = buildRoom({ shape: { kind: 'rect', width: 4, depth } });
          const door = buildOpening({ wall: 'north', offset: 0.5, width });
          const { session, clock, doc } = setup({
            ...buildDocument(),
            rooms: { [room.id]: room },
            openings: { [door.id]: door },
            objects: {},
            objectOrder: [],
          });
          const initial = doc();
          for (const [command, wait] of steps) {
            clock.advance(wait);
            session.execute(
              command.kind === 'open'
                ? setDoorOpen(DOOR, command.open)
                : command.kind === 'toggle'
                  ? toggleDoor(DOOR)
                  : setDoorSwing(DOOR, {
                      ...(command.swing ? { swing: command.swing } : {}),
                      ...(command.hinge ? { hinge: command.hinge } : {}),
                    }),
            );
            expect(checkInvariants(doc(), catalog)).toEqual([]);
          }
          while (session.undo()) {
            // unwind
          }
          expect(doc()).toEqual(initial);
        },
      ),
    );
  });
});

describe('doorSweepObstacles', () => {
  // door-1 on the south wall (z = 3) covers x 2.6–3.5; open, it sweeps up to 0.9 m into the room.
  function withDesk(x: number, z: number, open = 1, swing: 'in' | 'out' = 'in'): SceneDocument {
    const doc = buildDocument();
    const desk = buildObject({ id: 'desk', transform: { position: [x, 0, z], rotationY: 0 } });
    return {
      ...doc,
      openings: { ...doc.openings, [DOOR]: buildOpening({ open, swing }) },
      objects: { [desk.id]: desk },
      objectOrder: [desk.id],
    };
  }

  it('lists floor objects in the sweep of an open door', () => {
    expect(doorSweepObstacles(withDesk(3, 2.5), catalog, DOOR)).toEqual(['desk']);
  });

  it('ignores objects clear of it, closed doors, doors opening outwards and windows', () => {
    expect(doorSweepObstacles(withDesk(1, 1), catalog, DOOR)).toEqual([]);
    expect(doorSweepObstacles(withDesk(3, 2.5, 0), catalog, DOOR)).toEqual([]);
    expect(doorSweepObstacles(withDesk(3, 2.5, 1, 'out'), catalog, DOOR)).toEqual([]);
    expect(doorSweepObstacles(withDesk(3, 0.5), catalog, WINDOW)).toEqual([]);
  });
});
