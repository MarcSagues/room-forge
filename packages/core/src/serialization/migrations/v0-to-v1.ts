import type { Migration } from './types';

type Plain = Record<string, unknown>;

const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * v0 → v1. The first prototype wrote `rooms` and `objects` as arrays with flat fields (`width`,
 * `depth`, `floor`, `walls`; `room`, `catalog`, `x`, `z`, `rotation` in degrees) and had no
 * openings or lighting. Version 1 keys entities by id, nests shape, surfaces and transform, and
 * keeps rotation in radians. Self-contained on purpose: a migration never imports live defaults,
 * so it keeps doing the same thing when they change.
 */
export const v0ToV1: Migration = {
  from: 0,
  to: 1,
  migrate(input) {
    if (!isPlain(input)) throw new Error('A v0 document must be an object');
    const { rooms: oldRooms, objects: oldObjects } = input;
    if (!Array.isArray(oldRooms)) throw new Error('A v0 document needs a "rooms" array');
    if (oldObjects !== undefined && !Array.isArray(oldObjects)) {
      throw new Error('A v0 "objects" must be an array');
    }

    const rooms: Record<string, unknown> = {};
    const roomOrder: string[] = [];
    for (const old of oldRooms) {
      if (!isPlain(old) || typeof old.id !== 'string') throw new Error('A v0 room needs an "id"');
      const width = num(old.width, 4);
      const depth = num(old.depth, 4);
      const wallPreset = text(old.walls, 'paint.matte');
      const wall = () => ({ material: { presetId: wallPreset } });
      rooms[old.id] = {
        id: old.id,
        name: text(old.name, ''),
        shape: { kind: 'rect', width, depth },
        height: num(old.height, 2.6),
        origin: [-width / 2, -depth / 2],
        floor: { material: { presetId: text(old.floor, 'floor.oak') } },
        ceiling: { material: { presetId: text(old.ceiling, 'paint.matte') } },
        walls: { north: wall(), east: wall(), south: wall(), west: wall() },
      };
      roomOrder.push(old.id);
    }

    const objects: Record<string, unknown> = {};
    const objectOrder: string[] = [];
    for (const old of oldObjects ?? []) {
      if (!isPlain(old) || typeof old.id !== 'string') throw new Error('A v0 object needs an "id"');
      objects[old.id] = {
        id: old.id,
        catalogId: text(old.catalog, ''),
        roomId: text(old.room, ''),
        parentId: null,
        transform: {
          position: [num(old.x, 0), 0, num(old.z, 0)],
          rotationY: (num(old.rotation, 0) * Math.PI) / 180,
        },
        materials: {},
        locked: old.locked === true,
        hidden: false,
      };
      objectOrder.push(old.id);
    }

    return {
      schemaVersion: 1,
      units: 'm',
      rooms,
      roomOrder,
      openings: {},
      objects,
      objectOrder,
      lighting: { mode: 'day', ambient: 0.4, sunAzimuth: 135 },
    };
  },
};
