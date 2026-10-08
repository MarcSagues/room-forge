import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, LIMITS, type RoomId, type SceneDocument } from '../domain';
import { createEditorSession } from '../session';
import {
  buildDocument,
  buildObject,
  buildOpening,
  createFakeClock,
  createFixtureCatalog,
  createSeqIdGen,
} from '../testing';
import { createRoom, DEFAULT_ROOM_MATERIALS, resizeRoom, setSurfaceMaterial } from './room';

const ROOM = 'room-1' as RoomId;

function setup(initialDocument: SceneDocument = buildDocument()) {
  return createEditorSession({
    initialDocument,
    catalog: createFixtureCatalog(),
    idGen: createSeqIdGen('room'),
    clock: createFakeClock(0),
  });
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('room/create', () => {
  it('creates a centred room with default materials in an empty document', () => {
    const session = setup(createEmptyDocument());
    const result = session.execute(createRoom({ name: 'Office', width: 4, depth: 3, height: 2.6 }));

    expect(result.ok).toBe(true);
    const doc = session.getState().document;
    expect(doc.roomOrder).toEqual(['room-1']);
    expect(doc.rooms[ROOM]).toEqual({
      id: 'room-1',
      name: 'Office',
      shape: { kind: 'rect', width: 4, depth: 3 },
      height: 2.6,
      origin: [-2, -1.5],
      floor: { material: DEFAULT_ROOM_MATERIALS.floor },
      ceiling: { material: DEFAULT_ROOM_MATERIALS.ceiling },
      walls: {
        north: { material: DEFAULT_ROOM_MATERIALS.wall },
        east: { material: DEFAULT_ROOM_MATERIALS.wall },
        south: { material: DEFAULT_ROOM_MATERIALS.wall },
        west: { material: DEFAULT_ROOM_MATERIALS.wall },
      },
    });
  });

  it('uses a given id', () => {
    const session = setup(createEmptyDocument());
    session.execute(createRoom({ id: 'main', name: 'Main', width: 3, depth: 3, height: 2.5 }));
    expect(session.getState().document.roomOrder).toEqual(['main']);
  });

  it.each([
    ['minimum', { width: 2, depth: 2, height: 2.2 }, true],
    ['maximum', { width: 12, depth: 12, height: 4 }, true],
    ['too narrow', { width: 1.9, depth: 3, height: 2.5 }, false],
    ['too deep', { width: 3, depth: 12.5, height: 2.5 }, false],
    ['too low', { width: 3, depth: 3, height: 2 }, false],
    ['not a number', { width: Number.NaN, depth: 3, height: 2.5 }, false],
  ])('%s dimensions → ok = %s', (_, size, ok) => {
    const session = setup(createEmptyDocument());
    const result = session.execute(createRoom({ name: 'R', ...size }));
    expect(result.ok).toBe(ok);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid');
      expect(session.getState().document.roomOrder).toEqual([]);
    }
  });

  it('rejects a name over the limit and a duplicate id', () => {
    const session = setup();
    const long = 'x'.repeat(LIMITS.maxNameLength + 1);
    expect(session.execute(createRoom({ name: long, width: 3, depth: 3, height: 2.5 })).ok).toBe(
      false,
    );
    const dup = session.execute(
      createRoom({ id: ROOM, name: 'R', width: 3, depth: 3, height: 2.5 }),
    );
    expect(dup.ok).toBe(false);
  });
});

describe('room/resize', () => {
  it('resizes any combination of width, depth and height', () => {
    const session = setup();
    expect(session.execute(resizeRoom(ROOM, { width: 5 })).ok).toBe(true);
    expect(session.execute(resizeRoom(ROOM, { depth: 4, height: 3 })).ok).toBe(true);
    const room = session.getState().document.rooms[ROOM];
    expect(room?.shape).toEqual({ kind: 'rect', width: 5, depth: 4 });
    expect(room?.height).toBe(3);
  });

  it('rejects sizes outside the limits and unknown rooms', () => {
    const session = setup();
    expect(session.execute(resizeRoom(ROOM, { width: 13 })).ok).toBe(false);
    const missing = session.execute(resizeRoom('nope' as RoomId, { width: 3 }));
    expect(missing).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });

  it('blocks a resize that would leave objects or openings outside and lists them', () => {
    // Fixture room 4 × 3 × 2.6: the desk spans x 1.4–2.6; the door spans 0.5–1.4 on the south wall.
    const session = setup();
    const before = session.getState().document;

    const narrower = session.execute(resizeRoom(ROOM, { width: 2.2 }));
    expect(narrower).toMatchObject({
      ok: false,
      error: { code: 'conflict', conflicts: ['desk-1'] },
    });

    const window = buildOpening({ id: 'window-2', wall: 'east', offset: 2, width: 0.8 });
    const withWindow = setup({
      ...buildDocument(),
      openings: { ...buildDocument().openings, [window.id]: window },
    });
    const shallower = withWindow.execute(resizeRoom(ROOM, { depth: 2.5 }));
    expect(shallower).toMatchObject({
      ok: false,
      error: { code: 'conflict', conflicts: ['window-2'] },
    });

    const lower = session.execute(resizeRoom(ROOM, { height: 2.2 }));
    expect(lower.ok).toBe(true); // door is 2.1 m high: still fits

    expect(session.getState().document.rooms[ROOM]?.shape).toEqual(before.rooms[ROOM]?.shape);
  });

  it('reports every conflicting entity once', () => {
    const chair = buildObject({
      id: 'chair',
      catalogId: 'chair.office',
      transform: { position: [3.5, 0, 2.5], rotationY: 0 },
    });
    const doc = buildDocument();
    const session = setup({
      ...doc,
      objects: { ...doc.objects, [chair.id]: chair },
      objectOrder: [...doc.objectOrder, chair.id],
    });
    const result = session.execute(resizeRoom(ROOM, { width: 2, depth: 2 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect([...(result.error.conflicts ?? [])].sort()).toEqual(['chair', 'desk-1']);
  });

  it('coalesces consecutive resizes of the same room into one undo step', () => {
    const session = setup();
    session.execute(resizeRoom(ROOM, { width: 4.5 }));
    session.execute(resizeRoom(ROOM, { width: 5 }));
    session.undo();
    expect(session.getState().document.rooms[ROOM]?.shape.width).toBe(4);
  });
});

describe('room/setSurfaceMaterial', () => {
  it('changes the floor, ceiling or a single wall', () => {
    const session = setup();
    const tiles = { presetId: 'floor.tiles', tint: '#ddeeff' } as const;
    session.execute(setSurfaceMaterial(ROOM, 'floor', tiles));
    session.execute(setSurfaceMaterial(ROOM, 'east', { presetId: 'paint.matte', tint: '#ff0000' }));
    const room = session.getState().document.rooms[ROOM];
    expect(room?.floor.material).toEqual(tiles);
    expect(room?.walls.east.material.tint).toBe('#ff0000');
    expect(room?.walls.west.material.tint).toBeUndefined();
  });

  it('rejects invalid materials and unknown rooms', () => {
    const session = setup();
    const bad = session.execute(
      setSurfaceMaterial(ROOM, 'ceiling', { presetId: 'x', roughness: 2 }),
    );
    expect(bad).toMatchObject({ ok: false, error: { code: 'invalid' } });
    const missing = session.execute(
      setSurfaceMaterial('nope' as RoomId, 'floor', { presetId: 'x' }),
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });
});

describe('undo/redo of room commands', () => {
  it('restores the document exactly for each command', () => {
    const commands = [
      createRoom({ id: 'second', name: 'Second', width: 3, depth: 3, height: 2.5 }),
      resizeRoom(ROOM, { width: 6, depth: 5, height: 3 }),
      setSurfaceMaterial(ROOM, 'north', { presetId: 'brick.red', roughness: 0.9 }),
    ];
    for (const command of commands) {
      const session = setup();
      const before = copy(session.getState().document);
      expect(session.execute(command).ok).toBe(true);
      const after = copy(session.getState().document);
      session.undo();
      expect(session.getState().document).toEqual(before);
      session.redo();
      expect(session.getState().document).toEqual(after);
    }
  });

  it('property: a valid resize followed by undo restores the original', () => {
    const side = fc.double({ min: LIMITS.roomSide.min, max: LIMITS.roomSide.max, noNaN: true });
    const height = fc.double({
      min: LIMITS.roomHeight.min,
      max: LIMITS.roomHeight.max,
      noNaN: true,
    });
    fc.assert(
      fc.property(fc.record({ width: side, depth: side, height }), (size) => {
        const session = setup();
        const before = copy(session.getState().document);
        const result = session.execute(resizeRoom(ROOM, size));
        if (result.ok) session.undo();
        else expect(result.error.code).toBe('conflict');
        expect(session.getState().document).toEqual(before);
      }),
      { numRuns: 500 },
    );
  });
});
