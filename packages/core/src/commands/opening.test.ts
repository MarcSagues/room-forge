import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LIMITS, type OpeningId, type RoomId, type SceneDocument, WALL_IDS } from '../domain';
import { type Command, checkInvariants, createEditorSession } from '../session';
import { buildDocument, createFakeClock, createFixtureCatalog, createSeqIdGen } from '../testing';
import {
  addOpening,
  moveOpening,
  OPENING_VARIANTS,
  removeOpenings,
  resizeOpening,
} from './opening';

// Fixture room 4 (x) × 3 (z) × 2.6 m: north/south walls 4 m, east/west 3 m.
// It has door-1 on the south wall (0.5–1.4) and window-1 on the north wall (0.5–1.4, sill 0.9).
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

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('variants', () => {
  it('define default sizes for the four MVP openings', () => {
    expect(Object.keys(OPENING_VARIANTS).sort()).toEqual([
      'door.double',
      'door.single',
      'window.large',
      'window.standard',
    ]);
    for (const variant of Object.values(OPENING_VARIANTS)) {
      if (variant.kind === 'door') expect(variant.sill).toBe(0);
      expect(variant.sill + variant.height).toBeLessThanOrEqual(LIMITS.roomHeight.min);
    }
  });
});

describe('opening/add', () => {
  it('adds a variant with its default size', () => {
    const { session, doc } = setup();
    const result = session.execute(
      addOpening({ roomId: ROOM, wall: 'east', variant: 'window.standard', offset: 1 }),
    );
    expect(result.ok).toBe(true);
    expect(doc().openings['new-1' as OpeningId]).toEqual({
      id: 'new-1',
      roomId: ROOM,
      wall: 'east',
      kind: 'window',
      variant: 'window.standard',
      offset: 1,
      width: 1,
      height: 1.2,
      sill: 0.9,
    });
  });

  it('accepts size overrides', () => {
    const { session, doc } = setup();
    session.execute(
      addOpening({
        id: 'w',
        roomId: ROOM,
        wall: 'east',
        variant: 'window.large',
        offset: 0.5,
        width: 1.2,
        sill: 1,
      }),
    );
    expect(doc().openings['w' as OpeningId]).toMatchObject({ width: 1.2, height: 1.4, sill: 1 });
  });

  it('slides an out-of-range offset to the nearest valid one (10 cm from the corners)', () => {
    const { session, doc } = setup();
    session.execute(
      addOpening({ id: 'a', roomId: ROOM, wall: 'east', variant: 'door.single', offset: -2 }),
    );
    session.execute(
      addOpening({ id: 'b', roomId: ROOM, wall: 'west', variant: 'door.single', offset: 9 }),
    );
    expect(doc().openings['a' as OpeningId]?.offset).toBeCloseTo(0.1);
    expect(doc().openings['b' as OpeningId]?.offset).toBeCloseTo(3 - 0.1 - 0.9);
  });

  it('rejects an opening that overlaps another one with OVERLAP', () => {
    const { session, doc } = setup();
    const before = doc();
    const result = session.execute(
      addOpening({ roomId: ROOM, wall: 'south', variant: 'door.single', offset: 1 }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'overlap', conflicts: [DOOR] } });
    expect(doc()).toBe(before);
  });

  it('rejects openings that cannot fit and unknown variants or rooms', () => {
    const { session } = setup();
    const wide = session.execute(
      addOpening({ roomId: ROOM, wall: 'east', variant: 'window.large', offset: 0.1, width: 2.9 }),
    );
    expect(wide).toMatchObject({ ok: false, error: { code: 'invalid' } });
    const tall = session.execute(
      addOpening({ roomId: ROOM, wall: 'east', variant: 'window.large', offset: 0.5, sill: 1.5 }),
    );
    expect(tall).toMatchObject({ ok: false, error: { code: 'invalid' } });
    const variant = session.execute(
      addOpening({ roomId: ROOM, wall: 'east', variant: 'door.garage', offset: 1 }),
    );
    expect(variant).toMatchObject({ ok: false, error: { code: 'invalid' } });
    const room = session.execute(
      addOpening({ roomId: 'nope' as RoomId, wall: 'east', variant: 'door.single', offset: 1 }),
    );
    expect(room).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });

  it('returns limit-reached for a seventh opening on one wall', () => {
    const { session } = setup({ ...buildDocument(), openings: {} });
    for (let i = 0; i < LIMITS.maxOpeningsPerWall; i += 1) {
      const result = session.execute(
        addOpening({
          roomId: ROOM,
          wall: 'north',
          variant: 'window.standard',
          offset: 0.1 + i * 0.6,
          width: 0.5,
        }),
      );
      expect(result.ok, `opening ${i}`).toBe(true);
    }
    const seventh = session.execute(
      addOpening({
        roomId: ROOM,
        wall: 'north',
        variant: 'window.standard',
        offset: 3.7,
        width: 0.2,
      }),
    );
    expect(seventh).toMatchObject({ ok: false, error: { code: 'limit-reached' } });
  });
});

describe('opening/move', () => {
  it('slides along the same wall and coalesces consecutive moves', () => {
    const { session, clock, doc } = setup();
    session.execute(moveOpening(DOOR, { offset: 1 }));
    clock.advance(100);
    session.execute(moveOpening(DOOR, { offset: 2 }));
    expect(doc().openings[DOOR]?.offset).toBe(2);
    session.undo();
    expect(doc().openings[DOOR]?.offset).toBe(0.5);
  });

  it('moves to another wall, clamping the offset to that wall', () => {
    const { session, doc } = setup();
    session.execute(moveOpening(DOOR, { wall: 'east', offset: 2.5 }));
    expect(doc().openings[DOOR]).toMatchObject({ wall: 'east', offset: 3 - 0.1 - 0.9 });
  });

  it('rejects a move onto another opening and unknown ids', () => {
    const { session, doc } = setup();
    const before = doc();
    expect(session.execute(moveOpening(DOOR, { wall: 'north', offset: 0.8 }))).toMatchObject({
      ok: false,
      error: { code: 'overlap', conflicts: [WINDOW] },
    });
    expect(doc()).toBe(before);
    expect(session.execute(moveOpening('nope' as OpeningId, { offset: 1 }))).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
  });
});

describe('opening/resize', () => {
  it('changes width, height and sill, keeping the opening inside its wall', () => {
    const { session, doc } = setup();
    session.execute(moveOpening(WINDOW, { offset: 3 }));
    expect(doc().openings[WINDOW]?.offset).toBeCloseTo(4 - 0.1 - 0.9);
    session.execute(resizeOpening(WINDOW, { width: 1.5, height: 1, sill: 1.2 }));
    expect(doc().openings[WINDOW]).toMatchObject({ width: 1.5, height: 1, sill: 1.2 });
    expect(doc().openings[WINDOW]?.offset).toBeCloseTo(4 - 0.1 - 1.5);
  });

  it('keeps doors on the floor and rejects sizes that cannot fit or overlap', () => {
    const { session } = setup();
    expect(session.execute(resizeOpening(DOOR, { sill: 0.3 })).ok).toBe(false);
    expect(session.execute(resizeOpening(DOOR, { height: 2.7 })).ok).toBe(false);
    expect(session.execute(resizeOpening(DOOR, { width: 0 })).ok).toBe(false);
  });
});

describe('opening/remove', () => {
  it('removes one or more openings and reports unknown ids', () => {
    const { session, doc } = setup();
    expect(session.execute(removeOpenings([DOOR, WINDOW])).ok).toBe(true);
    expect(doc().openings).toEqual({});
    expect(session.execute(removeOpenings([DOOR])).ok).toBe(false);
    expect(session.execute(removeOpenings([])).ok).toBe(false);
  });
});

describe('opening properties', () => {
  const step = fc.oneof(
    fc.record({
      kind: fc.constant('add' as const),
      wall: fc.constantFrom(...WALL_IDS),
      variant: fc.constantFrom(
        ...(Object.keys(OPENING_VARIANTS) as (keyof typeof OPENING_VARIANTS)[]),
      ),
      offset: fc.double({ min: -1, max: 5, noNaN: true }),
    }),
    fc.record({
      kind: fc.constant('move' as const),
      target: fc.nat(),
      wall: fc.option(fc.constantFrom(...WALL_IDS), { nil: undefined }),
      offset: fc.double({ min: -1, max: 5, noNaN: true }),
    }),
    fc.record({
      kind: fc.constant('resize' as const),
      target: fc.nat(),
      width: fc.double({ min: 0.3, max: 3, noNaN: true }),
      height: fc.double({ min: 0.3, max: 2.5, noNaN: true }),
    }),
    fc.record({ kind: fc.constant('remove' as const), target: fc.nat() }),
    fc.record({ kind: fc.constant('undo' as const) }),
  );

  it('random sequences keep every invariant; undo/redo of each change restores exactly', () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 25 }), (steps) => {
        const { session, doc } = setup();
        const original = copy(doc());
        for (const s of steps) {
          const ids = Object.keys(doc().openings) as OpeningId[];
          const target = ids.length && 'target' in s ? ids[s.target % ids.length] : undefined;
          let command: Command | null = null;
          if (s.kind === 'add') {
            command = addOpening({
              roomId: ROOM,
              wall: s.wall,
              variant: s.variant,
              offset: s.offset,
            });
          } else if (s.kind === 'move' && target) {
            command = moveOpening(target, {
              offset: s.offset,
              ...(s.wall ? { wall: s.wall } : {}),
            });
          } else if (s.kind === 'resize' && target) {
            command = resizeOpening(target, { width: s.width, height: s.height });
          } else if (s.kind === 'remove' && target) {
            command = removeOpenings([target]);
          }
          if (s.kind === 'undo') session.undo();
          else if (command) {
            const before = copy(doc());
            const result = session.execute(command);
            if (result.ok && result.patches.length > 0) {
              const after = copy(doc());
              session.undo();
              expect(doc()).toEqual(before);
              session.redo();
              expect(doc()).toEqual(after);
            }
          }
          expect(checkInvariants(doc(), catalog)).toEqual([]);
        }
        while (session.undo());
        expect(doc()).toEqual(original);
      }),
      { numRuns: 300 },
    );
  });
});
