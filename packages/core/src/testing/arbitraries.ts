import fc from 'fast-check';
import { createEmptyDocument } from '../domain/document';
import type { ObjectId, OpeningId, RoomId } from '../domain/ids';
import { LIMITS } from '../domain/limits';
import {
  type HexColor,
  type LightState,
  type MaterialRef,
  type Opening,
  type PlacedObject,
  type Room,
  type SceneDocument,
  WALL_IDS,
} from '../domain/schemas';

// -0 does not survive JSON (it becomes 0), so generated numbers are normalised to +0.
const real = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((v) => (v === 0 ? 0 : v));

const hex: fc.Arbitrary<HexColor> = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => `#${n.toString(16).padStart(6, '0')}` as HexColor);

const name = fc.string({ maxLength: LIMITS.maxNameLength });
const key = fc.stringMatching(/^[a-z][a-z0-9.]{0,11}$/);
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const id = fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/).filter((value) => !RESERVED.has(value));

const materialRef: fc.Arbitrary<MaterialRef> = fc.record(
  { presetId: key, tint: hex, roughness: real(0, 1), metalness: real(0, 1) },
  { requiredKeys: ['presetId'] },
);
const surface = materialRef.map((material) => ({ material }));

const lightState: fc.Arbitrary<LightState> = fc.record({
  on: fc.boolean(),
  color: hex,
  intensity: real(0, 1),
  effect: fc.oneof(
    fc.constant({ kind: 'static' as const }),
    fc.record({ kind: fc.constant('breathing' as const), speed: real(0.1, LIMITS.maxEffectSpeed) }),
    fc.record(
      {
        kind: fc.constant('cycle' as const),
        speed: real(0.1, LIMITS.maxEffectSpeed),
        palette: fc.array(hex, { minLength: 1, maxLength: LIMITS.maxPaletteColors }),
      },
      { requiredKeys: ['kind', 'speed'] },
    ),
  ),
});

const roomData = fc.record({
  name,
  shape: fc.record({
    kind: fc.constant('rect' as const),
    width: real(LIMITS.roomSide.min, LIMITS.roomSide.max),
    depth: real(LIMITS.roomSide.min, LIMITS.roomSide.max),
  }),
  height: real(LIMITS.roomHeight.min, LIMITS.roomHeight.max),
  origin: fc.tuple(real(-20, 20), real(-20, 20)),
  floor: surface,
  ceiling: surface,
  walls: fc.record({ north: surface, east: surface, south: surface, west: surface }),
});

const openingData = fc
  .record({
    room: fc.nat(),
    wall: fc.constantFrom(...WALL_IDS),
    kind: fc.constantFrom('door' as const, 'window' as const),
    variant: key,
    offset: real(0, 6),
    width: real(0.3, 3),
    height: real(0.3, 2.4),
    sill: real(0, 1.5),
  })
  .map((o) => (o.kind === 'door' ? { ...o, sill: 0 } : o));

const objectData = fc.record(
  {
    room: fc.nat(),
    parent: fc.option(fc.nat(), { nil: null }),
    catalogId: key,
    name,
    transform: fc.record(
      {
        position: fc.tuple(real(-50, 50), real(0, 4), real(-50, 50)),
        rotationY: real(-Math.PI * 2, Math.PI * 2),
        scale: fc.tuple(real(0.1, 3), real(0.1, 3), real(0.1, 3)),
      },
      { requiredKeys: ['position', 'rotationY'] },
    ),
    materials: fc.dictionary(key, materialRef, { maxKeys: 4 }),
    light: lightState,
    params: fc.dictionary(
      key,
      fc.oneof(real(-100, 100), fc.string({ maxLength: 20 }), fc.boolean()),
      { maxKeys: 4 },
    ),
    locked: fc.boolean(),
    hidden: fc.boolean(),
  },
  { requiredKeys: ['room', 'parent', 'catalogId', 'transform', 'materials', 'locked', 'hidden'] },
);

const MAX_ROOMS = 3;
const MAX_OPENINGS = 6;
const MAX_OBJECTS = 10;

/**
 * Valid documents of every shape the schema allows: 1–3 rooms, some openings and objects (a few
 * stacked on an earlier object). Geometric invariants (I3, I4) are not enforced here.
 */
export function arbitraryDocument(): fc.Arbitrary<SceneDocument> {
  const idCount = MAX_ROOMS + MAX_OPENINGS + MAX_OBJECTS;
  return fc
    .record({
      rooms: fc.array(roomData, { minLength: 1, maxLength: MAX_ROOMS }),
      openings: fc.array(openingData, { maxLength: MAX_OPENINGS }),
      objects: fc.array(objectData, { maxLength: MAX_OBJECTS }),
      lighting: fc.record({
        mode: fc.constantFrom('day' as const, 'night' as const),
        ambient: real(0, 1),
        sunAzimuth: real(0, 360),
      }),
      ids: fc.uniqueArray(id, { minLength: idCount, maxLength: idCount }),
    })
    .map((data) => {
      const ids = data.ids.values();
      const take = () => ids.next().value as string;

      const rooms: Room[] = data.rooms.map((room) => ({ ...room, id: take() as RoomId }));
      const roomAt = (index: number) => (rooms[index % rooms.length] as Room).id;

      const openings: Opening[] = data.openings.map(({ room, ...opening }) => ({
        ...opening,
        id: take() as OpeningId,
        roomId: roomAt(room),
      }));

      const objects: PlacedObject[] = [];
      for (const { room, parent, ...object } of data.objects) {
        const support = parent === null ? undefined : objects[parent % Math.max(objects.length, 1)];
        objects.push({
          ...object,
          id: take() as ObjectId,
          roomId: support ? support.roomId : roomAt(room),
          parentId: support ? support.id : null,
        });
      }

      return {
        ...createEmptyDocument(),
        rooms: Object.fromEntries(rooms.map((room) => [room.id, room])),
        roomOrder: rooms.map((room) => room.id),
        openings: Object.fromEntries(openings.map((opening) => [opening.id, opening])),
        objects: Object.fromEntries(objects.map((object) => [object.id, object])),
        objectOrder: objects.map((object) => object.id),
        lighting: data.lighting,
      };
    });
}
