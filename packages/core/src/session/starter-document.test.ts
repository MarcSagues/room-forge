import { describe, expect, it } from 'vitest';
import { LIMITS, SceneDocumentSchema } from '../domain';
import { createFixtureCatalog } from '../testing';
import { checkInvariants } from './invariants';
import { DEFAULT_ROOM_SIZE } from './room-presets';
import { createStarterDocument } from './starter-document';

describe('createStarterDocument', () => {
  it('is a valid document with a single room and nothing else', () => {
    const document = createStarterDocument();
    expect(SceneDocumentSchema.safeParse(document).success).toBe(true);
    expect(document.roomOrder).toHaveLength(1);
    expect(Object.keys(document.rooms)).toHaveLength(1);
    expect(document.objectOrder).toEqual([]);
    expect(document.openings).toEqual({});
  });

  it('satisfies the invariants', () => {
    expect(checkInvariants(createStarterDocument(), createFixtureCatalog())).toEqual([]);
  });

  it('names the room as asked and uses a default size otherwise', () => {
    const named = createStarterDocument({ roomName: 'Habitación' });
    const room = Object.values(named.rooms)[0];
    expect(room?.name).toBe('Habitación');
    expect(room?.shape).toEqual({ kind: 'rect', width: 4, depth: 4.5 });
    expect(room?.height).toBe(2.6);
    expect(Object.values(createStarterDocument().rooms)[0]?.name).toBe('Room');
  });

  it('makes the room the size it is asked for, centred on the origin', () => {
    const room = Object.values(
      createStarterDocument({ width: 6, depth: 3.25, height: 3 }).rooms,
    )[0];
    expect(room?.shape).toEqual({ kind: 'rect', width: 6, depth: 3.25 });
    expect(room?.height).toBe(3);
    expect(room?.origin).toEqual([-3, -1.625]);
  });

  it('takes the default for what is not given', () => {
    const room = Object.values(createStarterDocument({ width: 5 }).rooms)[0];
    expect(room?.shape).toEqual({ kind: 'rect', width: 5, depth: DEFAULT_ROOM_SIZE.depth });
    expect(room?.height).toBe(DEFAULT_ROOM_SIZE.height);
  });

  it('refuses a size outside the limits instead of storing a room the app cannot open', () => {
    expect(() => createStarterDocument({ width: LIMITS.roomSide.min - 0.1 })).toThrow();
    expect(() => createStarterDocument({ depth: LIMITS.roomSide.max + 0.1 })).toThrow();
    expect(() => createStarterDocument({ height: LIMITS.roomHeight.max + 0.1 })).toThrow();
    expect(() => createStarterDocument({ width: Number.NaN })).toThrow();
  });

  it('gives every call its own copy, with its own ids', () => {
    const a = createStarterDocument();
    const b = createStarterDocument();
    expect(a).not.toBe(b);
    expect(a.roomOrder[0]).not.toBe(b.roomOrder[0]);
    a.roomOrder.push('x' as never);
    expect(b.roomOrder).toHaveLength(1);
  });

  it('is plain data a database can store', () => {
    const document = createStarterDocument();
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });
});
