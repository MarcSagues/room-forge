import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  type ObjectId,
  type PlacedObject,
  type RoomId,
  type SceneDocument,
} from '../domain';
import { type Command, checkInvariants, createEditorSession } from '../session';
import {
  buildDocument,
  buildObject,
  buildRoom,
  createFakeClock,
  createFixtureCatalog,
  createSeqIdGen,
} from '../testing';
import {
  addObject,
  DUPLICATE_OFFSET,
  duplicateObjects,
  moveObjects,
  removeObjects,
  reorderObject,
  rotateObjects,
  setObjectElevations,
  setObjectProps,
} from './object';

// Fixture room 4 × 3 × 2.6; desk-1 (1.2 × 0.6) at (2, 0, 1.5) with monitor-1 standing on it.
const ROOM = 'room-1' as RoomId;
const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;
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

describe('object/add', () => {
  it('adds an object with an id from the generator and lists it last', () => {
    const { session, doc } = setup();
    const result = session.execute(
      addObject({ catalogId: 'chair.office', roomId: ROOM, position: [1, 0, 2.2], rotationY: 0 }),
    );
    expect(result.ok).toBe(true);
    const added = doc().objects['new-1' as ObjectId];
    expect(added).toMatchObject({
      catalogId: 'chair.office',
      roomId: ROOM,
      parentId: null,
      transform: { position: [1, 0, 2.2], rotationY: 0 },
      materials: {},
      locked: false,
      hidden: false,
    });
    expect(doc().objectOrder.at(-1)).toBe('new-1');
  });

  it('moves a floor object that would cross a wall to the nearest valid spot', () => {
    const { session, doc } = setup();
    session.execute(
      addObject({
        id: 'chair',
        catalogId: 'chair.office',
        roomId: ROOM,
        position: [-1, 0, 5],
        rotationY: 0,
      }),
    );
    expect(doc().objects['chair' as ObjectId]?.transform.position).toEqual([0.3, 0, 2.7]);
  });

  it('rejects an object that cannot fit in the room at all', () => {
    const { session, doc } = setup({
      ...buildDocument(),
      rooms: { [ROOM]: buildRoom({ shape: { kind: 'rect', width: 2, depth: 2 } }) },
      objects: {},
      objectOrder: [],
      openings: {},
    });
    const result = session.execute(
      addObject({
        catalogId: 'desk.basic.120',
        roomId: ROOM,
        position: [1, 0, 1],
        rotationY: 0,
        scale: [2, 1, 1],
      }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(doc().objectOrder).toEqual([]);
  });

  it('keeps unknown catalog ids and their position as given (I6)', () => {
    const { session, doc } = setup();
    const result = session.execute(
      addObject({
        id: 'ghost',
        catalogId: 'removed.item',
        roomId: ROOM,
        position: [9, 0, 9],
        rotationY: 0,
      }),
    );
    expect(result.ok).toBe(true);
    expect(doc().objects['ghost' as ObjectId]?.transform.position).toEqual([9, 0, 9]);
  });

  it('places an object on a parent (local transform, no floor clamp)', () => {
    const { session, doc } = setup();
    const result = session.execute(
      addObject({
        id: 'lamp',
        catalogId: 'monitor.27',
        roomId: ROOM,
        parentId: DESK,
        position: [0.4, 0.75, 0],
        rotationY: 0,
      }),
    );
    expect(result.ok).toBe(true);
    expect(doc().objects['lamp' as ObjectId]?.parentId).toBe(DESK);
  });

  it('rejects unknown rooms and parents, and duplicate ids', () => {
    const { session } = setup();
    const base = {
      catalogId: 'chair.office',
      position: [1, 0, 1] as [number, number, number],
      rotationY: 0,
    };
    expect(session.execute(addObject({ ...base, roomId: 'nope' as RoomId }))).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(
      session.execute(addObject({ ...base, roomId: ROOM, parentId: 'nope' as ObjectId })),
    ).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(session.execute(addObject({ ...base, roomId: ROOM, id: DESK }))).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
  });

  it('returns limit-reached when adding object number 301', () => {
    const base = buildDocument();
    const objects: PlacedObject[] = Array.from({ length: LIMITS.maxObjects }, (_, i) =>
      buildObject({
        id: `o${i}`,
        catalogId: 'test.item',
        transform: { position: [1, 0, 1], rotationY: 0 },
      }),
    );
    const { session, doc } = setup({
      ...base,
      objects: Object.fromEntries(objects.map((o) => [o.id, o])),
      objectOrder: objects.map((o) => o.id),
    });
    const result = session.execute(
      addObject({ catalogId: 'chair.office', roomId: ROOM, position: [1, 0, 1], rotationY: 0 }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'limit-reached' } });
    expect(doc().objectOrder).toHaveLength(LIMITS.maxObjects);
  });
});

describe('object/move and object/rotate', () => {
  it('moves several objects at once', () => {
    const { session, doc } = setup();
    const result = session.execute(
      moveObjects([
        { id: DESK, position: [2.5, 0, 1] },
        { id: MONITOR, position: [0.1, 0.75, 0] },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(doc().objects[DESK]?.transform.position).toEqual([2.5, 0, 1]);
    expect(doc().objects[MONITOR]?.transform.position).toEqual([0.1, 0.75, 0]);
  });

  it('can set the rotation in the same move (wall snap during a drag)', () => {
    const { session, doc } = setup();
    const result = session.execute(
      moveObjects([{ id: DESK, position: [0.3, 0, 1.5], rotationY: Math.PI / 2 + 2 * Math.PI }]),
    );
    expect(result.ok).toBe(true);
    expect(doc().objects[DESK]?.transform.position).toEqual([0.3, 0, 1.5]);
    expect(doc().objects[DESK]?.transform.rotationY).toBeCloseTo(Math.PI / 2);
    expect(
      session.execute(moveObjects([{ id: DESK, position: [2, 0, 1.5], rotationY: Number.NaN }])).ok,
    ).toBe(false);
  });

  it('rejects a move that leaves the room without changing the document', () => {
    const { session, doc } = setup();
    const before = doc();
    const result = session.execute(moveObjects([{ id: DESK, position: [3.8, 0, 1.5] }]));
    expect(result).toMatchObject({ ok: false, error: { code: 'invariant' } });
    expect(doc()).toBe(before);
  });

  it('coalesces consecutive moves of the same objects into one undo step', () => {
    const { session, clock, doc } = setup();
    session.execute(moveObjects([{ id: DESK, position: [2.1, 0, 1.5] }]));
    clock.advance(100);
    session.execute(moveObjects([{ id: DESK, position: [2.2, 0, 1.5] }]));
    session.undo();
    expect(doc().objects[DESK]?.transform.position).toEqual([2, 0, 1.5]);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('rotates (normalised angle) and rejects a rotation that would cross a wall', () => {
    const { session, doc } = setup();
    expect(session.execute(rotateObjects([{ id: DESK, rotationY: 2 * Math.PI + 0.5 }])).ok).toBe(
      true,
    );
    expect(doc().objects[DESK]?.transform.rotationY).toBeCloseTo(0.5);

    // Against the west wall, turning by 45° makes the footprint wider than the gap.
    const fresh = setup();
    expect(fresh.session.execute(moveObjects([{ id: DESK, position: [0.6, 0, 1.5] }])).ok).toBe(
      true,
    );
    const before = fresh.doc();
    expect(fresh.session.execute(rotateObjects([{ id: DESK, rotationY: Math.PI / 4 }])).ok).toBe(
      false,
    );
    expect(fresh.doc()).toBe(before);
  });

  it('reports unknown ids and empty lists', () => {
    const { session } = setup();
    expect(
      session.execute(moveObjects([{ id: 'nope' as ObjectId, position: [1, 0, 1] }])),
    ).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(session.execute(rotateObjects([]))).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
  });

  it('rejects non-finite values', () => {
    const { session } = setup();
    expect(session.execute(moveObjects([{ id: DESK, position: [Number.NaN, 0, 1] }])).ok).toBe(
      false,
    );
    expect(session.execute(rotateObjects([{ id: DESK, rotationY: Infinity }])).ok).toBe(false);
  });
});

describe('object/setElevation', () => {
  // Room 2.6 m high, desk 0.75 m tall: its base may go from 0 to 1.85 m.
  it('raises a floor object, keeping x, z and its turn', () => {
    const { session, doc } = setup();
    const result = session.execute(setObjectElevations([{ id: DESK, elevation: 1.2 }]));
    expect(result.ok).toBe(true);
    expect(doc().objects[DESK]?.transform).toEqual({ position: [2, 1.2, 1.5], rotationY: 0 });
  });

  it('refuses an elevation above the ceiling or below the floor, leaving the document', () => {
    const { session, doc } = setup();
    const before = doc();
    for (const elevation of [1.9, -0.1]) {
      const result = session.execute(setObjectElevations([{ id: DESK, elevation }]));
      expect(result).toMatchObject({ ok: false, error: { code: 'invariant' } });
      if (!result.ok) expect(result.error.violations?.[0]?.invariant).toBe('I3');
    }
    expect(doc()).toBe(before);
  });

  it('clamps into the room when asked to (keyboard steps)', () => {
    const { session, doc } = setup();
    session.execute(setObjectElevations([{ id: DESK, elevation: 5 }], { clamp: true }));
    expect(doc().objects[DESK]?.transform.position[1]).toBeCloseTo(1.85);
    session.execute(setObjectElevations([{ id: DESK, elevation: -5 }], { clamp: true }));
    expect(doc().objects[DESK]?.transform.position[1]).toBe(0);
  });

  it('records nothing when the clamped value is the current one', () => {
    const { session } = setup();
    const result = session.execute(
      setObjectElevations([{ id: DESK, elevation: -1 }], { clamp: true }),
    );
    expect(result.ok && result.patches).toEqual([]);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('coalesces a burst of changes into one undo step', () => {
    const { session, clock, doc } = setup();
    session.execute(setObjectElevations([{ id: DESK, elevation: 0.1 }]));
    clock.advance(100);
    session.execute(setObjectElevations([{ id: DESK, elevation: 0.2 }]));
    expect(doc().objects[DESK]?.transform.position[1]).toBe(0.2);
    session.undo();
    expect(doc().objects[DESK]?.transform.position[1]).toBe(0);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('moves what stands on the object with it (local positions)', () => {
    const { session, doc } = setup();
    session.execute(setObjectElevations([{ id: DESK, elevation: 0.5 }]));
    expect(doc().objects[MONITOR]?.transform.position).toEqual([0, 0.75, -0.2]);
  });

  it('refuses objects standing on another, non-finite values and unknown ids', () => {
    const { session } = setup();
    expect(session.execute(setObjectElevations([{ id: MONITOR, elevation: 1 }]))).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    expect(
      session.execute(setObjectElevations([{ id: DESK, elevation: Number.NaN }])),
    ).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(
      session.execute(setObjectElevations([{ id: 'nope' as ObjectId, elevation: 1 }])),
    ).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });

  it('stays inside the room after any clamped change (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -10, max: 10, noNaN: true }), { maxLength: 15 }),
        fc.double({ min: 0.5, max: 2, noNaN: true }),
        (elevations, scaleY) => {
          const { session, doc } = setup();
          session.execute(setObjectProps([DESK], { scale: [1, scaleY, 1] }));
          for (const elevation of elevations) {
            expect(
              session.execute(setObjectElevations([{ id: DESK, elevation }], { clamp: true })).ok,
            ).toBe(true);
            const y = doc().objects[DESK]?.transform.position[1] ?? Number.NaN;
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y + 0.75 * scaleY).toBeLessThanOrEqual(2.6 + 1e-9);
          }
          expect(checkInvariants(doc(), catalog)).toEqual([]);
        },
      ),
    );
  });
});

describe('object/setProps', () => {
  it('sets name, locked, hidden, scale and merges params', () => {
    const { session, doc } = setup();
    session.execute(setObjectProps([DESK], { params: { width: 1.2, label: 'A' } }));
    const result = session.execute(
      setObjectProps([DESK], {
        name: 'Main desk',
        locked: true,
        hidden: true,
        params: { label: 'B' },
      }),
    );
    expect(result.ok).toBe(true);
    expect(doc().objects[DESK]).toMatchObject({
      name: 'Main desk',
      locked: true,
      hidden: true,
      params: { width: 1.2, label: 'B' },
    });
  });

  it('clears the name with null and rejects invalid values', () => {
    const { session, doc } = setup();
    session.execute(setObjectProps([DESK], { name: 'X' }));
    session.execute(setObjectProps([DESK], { name: null }));
    expect(doc().objects[DESK]).not.toHaveProperty('name');
    const long = 'x'.repeat(LIMITS.maxNameLength + 1);
    expect(session.execute(setObjectProps([DESK], { name: long })).ok).toBe(false);
    expect(session.execute(setObjectProps([DESK], { scale: [0, 1, 1] })).ok).toBe(false);
  });

  it('rejects a scale that pushes a floor object out of the room', () => {
    const { session } = setup();
    expect(session.execute(setObjectProps([DESK], { scale: [4, 1, 1] }))).toMatchObject({
      ok: false,
      error: { code: 'invariant' },
    });
  });
});

describe('object/remove', () => {
  it('removes the objects standing on a removed object as well', () => {
    const { session, doc } = setup();
    const result = session.execute(removeObjects([DESK]));
    expect(result.ok).toBe(true);
    expect(doc().objects).toEqual({});
    expect(doc().objectOrder).toEqual([]);
  });

  it('removes a child alone and leaves its parent', () => {
    const { session, doc } = setup();
    session.execute(removeObjects([MONITOR]));
    expect(Object.keys(doc().objects)).toEqual([DESK]);
  });

  it('clears the selection of removed objects', () => {
    const { session } = setup();
    session.select([MONITOR]);
    session.execute(removeObjects([DESK]));
    expect(session.getState().selection).toEqual([]);
  });

  it('reports unknown ids', () => {
    const { session } = setup();
    expect(session.execute(removeObjects(['nope' as ObjectId])).ok).toBe(false);
  });
});

describe('object/duplicate', () => {
  it('copies a floor object with an offset and its children with it', () => {
    const { session, doc } = setup();
    const result = session.execute(duplicateObjects([DESK]));
    expect(result.ok).toBe(true);
    const deskCopy = doc().objects['new-1' as ObjectId];
    const monitorCopy = doc().objects['new-2' as ObjectId];
    expect(deskCopy?.transform.position).toEqual([
      2 + DUPLICATE_OFFSET[0],
      0,
      1.5 + DUPLICATE_OFFSET[1],
    ]);
    expect(monitorCopy).toMatchObject({ catalogId: 'monitor.27', parentId: 'new-1' });
    // Children keep their local transform: they move with the parent copy.
    expect(monitorCopy?.transform).toEqual(doc().objects[MONITOR]?.transform);
    expect(doc().objectOrder).toEqual([DESK, MONITOR, 'new-1', 'new-2']);
  });

  it('keeps a duplicated child on the same parent', () => {
    const { session, doc } = setup();
    session.execute(duplicateObjects([MONITOR], { offset: [0.1, 0] }));
    const copyOfMonitor = doc().objects['new-1' as ObjectId];
    expect(copyOfMonitor?.parentId).toBe(DESK);
    expect(copyOfMonitor?.transform.position).toEqual([0.1, 0.75, -0.2]);
  });

  it('keeps a copy inside the room when the offset would push it out', () => {
    const { session, doc } = setup();
    session.execute(moveObjects([{ id: DESK, position: [3.4, 0, 2.7] }]));
    session.execute(duplicateObjects([DESK]));
    expect(doc().objects['new-1' as ObjectId]?.transform.position).toEqual([3.4, 0, 2.7]);
  });

  it('returns limit-reached when the copies would exceed the object limit', () => {
    const base = buildDocument();
    const objects: PlacedObject[] = Array.from({ length: LIMITS.maxObjects - 1 }, (_, i) =>
      buildObject({ id: `o${i}`, catalogId: 'test.item' }),
    );
    const { session } = setup({
      ...base,
      objects: Object.fromEntries(objects.map((o) => [o.id, o])),
      objectOrder: objects.map((o) => o.id),
    });
    session.execute(
      addObject({
        id: 'desk',
        catalogId: 'desk.basic.120',
        roomId: ROOM,
        position: [2, 0, 1.5],
        rotationY: 0,
      }),
    );
    expect(session.execute(duplicateObjects(['desk' as ObjectId]))).toMatchObject({
      ok: false,
      error: { code: 'limit-reached' },
    });
  });
});

describe('undo/redo of object commands', () => {
  it('restores the document exactly for each command', () => {
    const commands: Command[] = [
      addObject({ catalogId: 'chair.office', roomId: ROOM, position: [1, 0, 2.2], rotationY: 0 }),
      moveObjects([{ id: DESK, position: [2.4, 0, 1.2] }]),
      rotateObjects([{ id: DESK, rotationY: Math.PI / 2 }]),
      setObjectProps([DESK], { name: 'Desk', hidden: true, params: { w: 1 } }),
      removeObjects([DESK]),
      duplicateObjects([DESK]),
    ];
    for (const command of commands) {
      const { session, doc } = setup();
      const before = copy(doc());
      expect(session.execute(command).ok, command.type).toBe(true);
      const after = copy(doc());
      session.undo();
      expect(doc(), command.type).toEqual(before);
      session.redo();
      expect(doc(), command.type).toEqual(after);
    }
  });
});

describe('object command sequences (property)', () => {
  const pick = fc.nat();
  const commandArb = fc.oneof(
    fc
      .record({
        catalogId: fc.constantFrom('desk.basic.120', 'chair.office', 'monitor.27', 'unknown.item'),
        x: fc.double({ min: -2, max: 6, noNaN: true }),
        z: fc.double({ min: -2, max: 5, noNaN: true }),
        rotation: fc.double({ min: -7, max: 7, noNaN: true }),
        onParent: fc.boolean(),
        parent: pick,
      })
      .map((a) => ({ kind: 'add' as const, ...a })),
    fc.record({
      kind: fc.constant('move' as const),
      target: pick,
      x: fc.double({ min: -1, max: 5, noNaN: true }),
      z: fc.double({ min: -1, max: 4, noNaN: true }),
    }),
    fc.record({
      kind: fc.constant('rotate' as const),
      target: pick,
      rotation: fc.double({ min: -7, max: 7, noNaN: true }),
    }),
    fc.record({
      kind: fc.constant('props' as const),
      target: pick,
      hidden: fc.boolean(),
      scale: fc.double({ min: 0.5, max: 2, noNaN: true }),
    }),
    fc.record({
      kind: fc.constant('elevate' as const),
      target: pick,
      y: fc.double({ min: -1, max: 4, noNaN: true }),
      clamp: fc.boolean(),
    }),
    fc.record({ kind: fc.constant('remove' as const), target: pick }),
    fc.record({ kind: fc.constant('duplicate' as const), target: pick }),
    fc.record({ kind: fc.constant('undo' as const) }),
  );

  it('keeps every invariant and undoing everything restores the original', () => {
    fc.assert(
      fc.property(fc.array(commandArb, { maxLength: 25 }), (steps) => {
        const { session, doc } = setup();
        const original = copy(doc());
        for (const step of steps) {
          const ids = doc().objectOrder;
          const target = ids.length
            ? (ids[('target' in step ? step.target : 0) % ids.length] as ObjectId)
            : DESK;
          let command: Command | null = null;
          if (step.kind === 'add') {
            const parent =
              ids.length && step.onParent ? (ids[step.parent % ids.length] as ObjectId) : null;
            command = addObject({
              catalogId: step.catalogId,
              roomId: ROOM,
              position: [step.x, parent ? 0.75 : 0, step.z],
              rotationY: step.rotation,
              ...(parent ? { parentId: parent } : {}),
            });
          } else if (step.kind === 'move')
            command = moveObjects([{ id: target, position: [step.x, 0, step.z] }]);
          else if (step.kind === 'rotate')
            command = rotateObjects([{ id: target, rotationY: step.rotation }]);
          else if (step.kind === 'props')
            command = setObjectProps([target], {
              hidden: step.hidden,
              scale: [step.scale, 1, step.scale],
            });
          else if (step.kind === 'elevate')
            command = setObjectElevations([{ id: target, elevation: step.y }], {
              clamp: step.clamp,
            });
          else if (step.kind === 'remove') command = removeObjects([target]);
          else if (step.kind === 'duplicate') command = duplicateObjects([target]);
          if (command) session.execute(command);
          else session.undo();
          expect(checkInvariants(doc(), catalog)).toEqual([]);
        }
        while (session.undo());
        expect(doc()).toEqual(original);
      }),
      { numRuns: 300 },
    );
  });
});

describe('object/reorder', () => {
  /** A fresh session on buildDocument plus chair-1..chair-3 (unknown items: placed as asked). */
  function withChairs() {
    const ctx = setup();
    for (const n of [1, 2, 3]) {
      ctx.session.execute(
        addObject({
          id: `chair-${n}`,
          catalogId: 'unknown.item',
          roomId: ROOM,
          position: [n, 0, 0.5],
          rotationY: 0,
        }),
      );
    }
    return setup(copy(ctx.doc()) as SceneDocument);
  }

  it('moves an object to the given index, keeping the others in order', () => {
    const { session, doc } = withChairs();
    const result = session.execute(reorderObject('chair-3' as ObjectId, 0));
    expect(result.ok).toBe(true);
    expect(doc().objectOrder).toEqual(['chair-3', DESK, MONITOR, 'chair-1', 'chair-2']);
    session.execute(reorderObject(DESK, 4));
    expect(doc().objectOrder).toEqual(['chair-3', MONITOR, 'chair-1', 'chair-2', DESK]);
  });

  it('is labelled, and repeated moves of one object coalesce into one entry', () => {
    const { session, clock, doc } = withChairs();
    const before = copy(doc().objectOrder);
    session.execute(reorderObject('chair-3' as ObjectId, 3));
    clock.advance(100);
    session.execute(reorderObject('chair-3' as ObjectId, 2));
    expect(session.getState().history.undoLabel).toBe('Reorder object');
    session.undo();
    expect(doc().objectOrder).toEqual(before);
  });

  it('rejects unknown ids and indices outside the list without changing anything', () => {
    const { session, doc } = withChairs();
    const before = copy(doc());
    expect(session.execute(reorderObject('nope' as ObjectId, 0))).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
    for (const index of [-1, 5, 1.5, Number.NaN]) {
      expect(session.execute(reorderObject(DESK, index))).toMatchObject({
        ok: false,
        error: { code: 'invalid' },
      });
    }
    expect(doc()).toEqual(before);
  });

  it('keeps the order a permutation, invariants hold and undo restores it (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 15 }), (moves) => {
        const { session, doc } = withChairs();
        const original = copy(doc());
        for (const [from, to] of moves) {
          const order = doc().objectOrder;
          const id = order[from % order.length] as ObjectId;
          const index = to % order.length;
          const others = order.filter((other) => other !== id);
          expect(session.execute(reorderObject(id, index)).ok).toBe(true);
          const next = doc().objectOrder;
          expect([...next].sort()).toEqual([...order].sort());
          expect(next[index]).toBe(id);
          expect(next.filter((other) => other !== id)).toEqual(others);
          expect(checkInvariants(doc(), catalog)).toEqual([]);
        }
        while (session.undo());
        expect(doc()).toEqual(original);
      }),
      { numRuns: 200 },
    );
  });
});
