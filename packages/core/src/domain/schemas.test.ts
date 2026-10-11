import { describe, expect, it } from 'vitest';
import { buildDocument, buildObject, buildOpening, buildRoom } from '../testing';
import { createEmptyDocument } from './document';
import { LIMITS } from './limits';
import {
  HexColorSchema,
  LightingSchema,
  LightStateSchema,
  MaterialRefSchema,
  OpeningSchema,
  PlacedObjectSchema,
  parseSceneDocument,
  RoomSchema,
  SCHEMA_VERSION,
  type SceneDocument,
  SceneDocumentSchema,
} from './schemas';

/** Collects zod issue messages so assertions read like what a user would see. */
function errorsOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? []);
}

describe('HexColorSchema', () => {
  it.each(['#000000', '#ff8800', '#A0B1C2'])('accepts %s', (color) => {
    expect(HexColorSchema.safeParse(color).success).toBe(true);
  });

  it.each(['red', '#fff', '#12345g', '000000', '#1234567'])('rejects %s', (color) => {
    expect(HexColorSchema.safeParse(color).success).toBe(false);
  });
});

describe('RoomSchema', () => {
  it('accepts a room at the dimension limits', () => {
    const min = buildRoom({ shape: { kind: 'rect', width: 2, depth: 2 }, height: 2.2 });
    const max = buildRoom({ shape: { kind: 'rect', width: 12, depth: 12 }, height: 4 });
    expect(RoomSchema.safeParse(min).success).toBe(true);
    expect(RoomSchema.safeParse(max).success).toBe(true);
  });

  it.each([
    ['too narrow', { shape: { kind: 'rect', width: 1.99, depth: 4 } }],
    ['too deep', { shape: { kind: 'rect', width: 4, depth: 12.01 } }],
    ['too low', { height: 2.1 }],
    ['too high', { height: 4.01 }],
  ] as const)('rejects a room that is %s', (_, override) => {
    expect(RoomSchema.safeParse(buildRoom(override)).success).toBe(false);
  });

  it('rejects NaN and infinite numbers (I7)', () => {
    expect(RoomSchema.safeParse(buildRoom({ height: Number.NaN })).success).toBe(false);
    expect(RoomSchema.safeParse(buildRoom({ origin: [Infinity, 0] })).success).toBe(false);
  });

  it('says what is wrong in English, as classic zod did (zod/mini has no locale of its own)', () => {
    expect(errorsOf(RoomSchema.safeParse(buildRoom({ height: 4.01 })))).toEqual([
      'Too big: expected number to be <=4',
    ]);
    expect(errorsOf(RoomSchema.safeParse({ ...buildRoom(), floor: undefined }))).toEqual([
      'Invalid input: expected object, received undefined',
    ]);
  });

  it('rejects names longer than the limit', () => {
    const name = 'x'.repeat(LIMITS.maxNameLength + 1);
    const result = RoomSchema.safeParse(buildRoom({ name }));
    expect(errorsOf(result).join()).toMatch(/80/);
  });

  it('requires all four walls', () => {
    const { walls, ...room } = buildRoom();
    const { west: _, ...threeWalls } = walls;
    expect(RoomSchema.safeParse({ ...room, walls: threeWalls }).success).toBe(false);
  });

  it('rejects unknown shape kinds', () => {
    const room = { ...buildRoom(), shape: { kind: 'polygon', points: [] } };
    expect(RoomSchema.safeParse(room).success).toBe(false);
  });
});

describe('OpeningSchema', () => {
  it('accepts doors at floor level and windows with a sill', () => {
    expect(OpeningSchema.safeParse(buildOpening({ kind: 'door', sill: 0 })).success).toBe(true);
    expect(OpeningSchema.safeParse(buildOpening({ kind: 'window', sill: 0.9 })).success).toBe(true);
  });

  it('requires the door state on doors and refuses it on windows (v2)', () => {
    const { open: _open, ...noOpen } = buildOpening();
    expect(errorsOf(OpeningSchema.safeParse(noOpen)).join()).toMatch(/open/);
    const window = { ...buildOpening({ kind: 'window', sill: 0.9 }), hinge: 'left' };
    expect(errorsOf(OpeningSchema.safeParse(window)).join()).toMatch(/hinge/);
    expect(OpeningSchema.safeParse(buildOpening({ open: 1.2 })).success).toBe(false);
    expect(OpeningSchema.safeParse({ ...buildOpening(), swing: 'sideways' }).success).toBe(false);
  });

  it('rejects a door with a sill', () => {
    const result = OpeningSchema.safeParse(buildOpening({ kind: 'door', sill: 0.5 }));
    expect(errorsOf(result).join()).toMatch(/door/i);
  });

  it('rejects zero or negative sizes', () => {
    expect(OpeningSchema.safeParse(buildOpening({ width: 0 })).success).toBe(false);
    expect(OpeningSchema.safeParse(buildOpening({ offset: -0.1 })).success).toBe(false);
  });
});

describe('MaterialRefSchema', () => {
  it('accepts overrides within 0..1', () => {
    const ref = { presetId: 'wood.oak', tint: '#aa8855', roughness: 0, metalness: 1 };
    expect(MaterialRefSchema.safeParse(ref).success).toBe(true);
  });

  it('rejects out-of-range overrides and empty presets', () => {
    expect(MaterialRefSchema.safeParse({ presetId: 'x', roughness: 1.1 }).success).toBe(false);
    expect(MaterialRefSchema.safeParse({ presetId: '' }).success).toBe(false);
  });

  it('rejects an explicit undefined for an optional field (exact optional)', () => {
    expect(MaterialRefSchema.safeParse({ presetId: 'x', tint: undefined }).success).toBe(false);
  });
});

describe('LightStateSchema', () => {
  it.each([
    { kind: 'static' },
    { kind: 'breathing', speed: 1 },
    { kind: 'cycle', speed: 2, palette: ['#ff0000', '#00ff00'] },
  ])('accepts the $kind effect', (effect) => {
    const light = { on: true, color: '#ff00ff', intensity: 0.8, effect };
    expect(LightStateSchema.safeParse(light).success).toBe(true);
  });

  it('rejects intensity outside 0..1 and unknown effects', () => {
    const base = { on: true, color: '#ffffff', effect: { kind: 'static' } };
    expect(LightStateSchema.safeParse({ ...base, intensity: 1.5 }).success).toBe(false);
    const strobe = { ...base, intensity: 1, effect: { kind: 'strobe' } };
    expect(LightStateSchema.safeParse(strobe).success).toBe(false);
  });
});

describe('LightingSchema', () => {
  it('accepts the documented ranges', () => {
    expect(LightingSchema.safeParse({ mode: 'night', ambient: 0, sunAzimuth: 360 }).success).toBe(
      true,
    );
    expect(LightingSchema.safeParse({ mode: 'day', ambient: 2, sunAzimuth: 0 }).success).toBe(
      false,
    );
  });
});

describe('PlacedObjectSchema', () => {
  it('accepts a minimal object and one with every optional field', () => {
    expect(PlacedObjectSchema.safeParse(buildObject()).success).toBe(true);
    const full = buildObject({
      name: 'Desk lamp',
      transform: { position: [1, 0.75, 1], rotationY: Math.PI, scale: [1, 1, 1] },
      materials: { body: { presetId: 'metal.black' } },
      light: { on: true, color: '#ffaa00', intensity: 1, effect: { kind: 'static' } },
      params: { width: 1.6, label: 'L', mirrored: false },
    });
    expect(PlacedObjectSchema.safeParse(full).success).toBe(true);
  });

  it('rejects positions with non-finite numbers and non-positive scales', () => {
    const nan = buildObject({ transform: { position: [0, Number.NaN, 0], rotationY: 0 } });
    expect(PlacedObjectSchema.safeParse(nan).success).toBe(false);
    const flat = buildObject({
      transform: { position: [0, 0, 0], rotationY: 0, scale: [1, 0, 1] },
    });
    expect(PlacedObjectSchema.safeParse(flat).success).toBe(false);
  });
});

describe('SceneDocumentSchema', () => {
  it('accepts the empty document', () => {
    expect(SceneDocumentSchema.safeParse(createEmptyDocument()).success).toBe(true);
  });

  it('accepts a document with rooms, openings and stacked objects', () => {
    expect(SceneDocumentSchema.safeParse(buildDocument()).success).toBe(true);
  });

  it('rejects other schema versions and units', () => {
    expect(
      SceneDocumentSchema.safeParse({ ...createEmptyDocument(), schemaVersion: SCHEMA_VERSION + 1 })
        .success,
    ).toBe(false);
    expect(SceneDocumentSchema.safeParse({ ...createEmptyDocument(), units: 'cm' }).success).toBe(
      false,
    );
  });

  it('rejects a map key that does not match the entity id', () => {
    const doc = buildDocument();
    const [roomId, room] = Object.entries(doc.rooms)[0] ?? [];
    const broken = { ...doc, rooms: { [`${roomId}x`]: room } };
    expect(errorsOf(SceneDocumentSchema.safeParse(broken)).join()).toMatch(/does not match/);
  });

  it('rejects ids shared between rooms, openings and objects (I1)', () => {
    const doc = buildDocument();
    const room = Object.values(doc.rooms)[0];
    const object = Object.values(doc.objects)[0];
    if (!room || !object) throw new Error('fixture needs a room and an object');
    const clash = { ...object, id: room.id };
    const broken = {
      ...doc,
      objects: { ...doc.objects, [room.id]: clash },
      objectOrder: [...doc.objectOrder, room.id],
    };
    expect(errorsOf(SceneDocumentSchema.safeParse(broken)).join()).toMatch(/duplicate id/i);
  });

  it('rejects order lists that do not list every entity exactly once', () => {
    const doc = buildDocument();
    const missing = { ...doc, objectOrder: doc.objectOrder.slice(1) };
    expect(errorsOf(SceneDocumentSchema.safeParse(missing)).join()).toMatch(/objectOrder/);
    const repeated = { ...doc, roomOrder: [...doc.roomOrder, ...doc.roomOrder] };
    expect(errorsOf(SceneDocumentSchema.safeParse(repeated)).join()).toMatch(/roomOrder/);
  });

  it('rejects references to rooms or parents that do not exist (I1)', () => {
    const doc = buildDocument();
    const object = Object.values(doc.objects)[0];
    const opening = Object.values(doc.openings)[0];
    if (!object || !opening) throw new Error('fixture needs an object and an opening');

    const orphan = {
      ...doc,
      objects: { ...doc.objects, [object.id]: { ...object, roomId: 'nope' } },
    };
    expect(errorsOf(SceneDocumentSchema.safeParse(orphan)).join()).toMatch(/unknown room/);

    const lost = {
      ...doc,
      objects: { ...doc.objects, [object.id]: { ...object, parentId: 'nope' } },
    };
    expect(errorsOf(SceneDocumentSchema.safeParse(lost)).join()).toMatch(/unknown parent/);

    const self = {
      ...doc,
      objects: { ...doc.objects, [object.id]: { ...object, parentId: object.id } },
    };
    expect(errorsOf(SceneDocumentSchema.safeParse(self)).join()).toMatch(/own parent/);

    const floating = {
      ...doc,
      openings: { ...doc.openings, [opening.id]: { ...opening, roomId: 'nope' } },
    };
    expect(errorsOf(SceneDocumentSchema.safeParse(floating)).join()).toMatch(/unknown room/);
  });

  it('enforces the object and openings-per-wall limits', () => {
    const doc = buildDocument();
    const room = Object.values(doc.rooms)[0];
    if (!room) throw new Error('fixture needs a room');

    const many = Array.from({ length: LIMITS.maxObjects + 1 }, (_, i) =>
      buildObject({ id: `o${i}`, roomId: room.id }),
    );
    const crowded: SceneDocument = {
      ...doc,
      objects: Object.fromEntries(many.map((o) => [o.id, o])),
      objectOrder: many.map((o) => o.id),
    };
    expect(errorsOf(SceneDocumentSchema.safeParse(crowded)).join()).toMatch(/300/);

    const holes = Array.from({ length: LIMITS.maxOpeningsPerWall + 1 }, (_, i) =>
      buildOpening({ id: `w${i}`, roomId: room.id, wall: 'east' }),
    );
    const swiss: SceneDocument = {
      ...doc,
      openings: Object.fromEntries(holes.map((o) => [o.id, o])),
    };
    expect(errorsOf(SceneDocumentSchema.safeParse(swiss)).join()).toMatch(/east/);
  });
});

describe('parseSceneDocument', () => {
  it('returns the typed document or readable error messages', () => {
    const ok = parseSceneDocument(buildDocument());
    expect(ok.ok).toBe(true);

    const bad = parseSceneDocument({ ...createEmptyDocument(), lighting: { mode: 'dusk' } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.length).toBeGreaterThan(0);
      expect(bad.errors.some((e) => e.startsWith('lighting.mode:'))).toBe(true);
    }
  });

  it('rejects values that are not plain JSON objects', () => {
    expect(parseSceneDocument(null).ok).toBe(false);
    expect(parseSceneDocument('{}').ok).toBe(false);
  });
});
