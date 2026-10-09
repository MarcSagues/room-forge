import type { GoldenCase } from './types';

/**
 * A document as the (hypothetical) first prototype wrote it: rooms and objects as arrays with flat
 * fields, rotation in degrees, no openings and no lighting. It stays here for ever: it is what the
 * v0 → v1 migration is tested against.
 */
const input = {
  schemaVersion: 0,
  rooms: [
    {
      id: 'room-a',
      name: 'Office',
      width: 4,
      depth: 3.5,
      height: 2.6,
      floor: 'floor.concrete',
      walls: 'paint.warm',
    },
  ],
  objects: [
    { id: 'desk-1', room: 'room-a', catalog: 'desk.basic.120', x: 2, z: 1.75, rotation: 90 },
    { id: 'lamp-1', room: 'room-a', catalog: 'lamp.floor', x: 0.5, z: 0.5, locked: true },
  ],
};

const expected = {
  schemaVersion: 1,
  units: 'm',
  rooms: {
    'room-a': {
      id: 'room-a',
      name: 'Office',
      shape: { kind: 'rect', width: 4, depth: 3.5 },
      height: 2.6,
      origin: [-2, -1.75],
      floor: { material: { presetId: 'floor.concrete' } },
      ceiling: { material: { presetId: 'paint.matte' } },
      walls: {
        north: { material: { presetId: 'paint.warm' } },
        east: { material: { presetId: 'paint.warm' } },
        south: { material: { presetId: 'paint.warm' } },
        west: { material: { presetId: 'paint.warm' } },
      },
    },
  },
  roomOrder: ['room-a'],
  openings: {},
  objects: {
    'desk-1': {
      id: 'desk-1',
      catalogId: 'desk.basic.120',
      roomId: 'room-a',
      parentId: null,
      transform: { position: [2, 0, 1.75], rotationY: Math.PI / 2 },
      materials: {},
      locked: false,
      hidden: false,
    },
    'lamp-1': {
      id: 'lamp-1',
      catalogId: 'lamp.floor',
      roomId: 'room-a',
      parentId: null,
      transform: { position: [0.5, 0, 0.5], rotationY: 0 },
      materials: {},
      locked: true,
      hidden: false,
    },
  },
  objectOrder: ['desk-1', 'lamp-1'],
  lighting: { mode: 'day', ambient: 0.4, sunAzimuth: 135 },
};

export const v0ToV1: GoldenCase = { name: 'v0-to-v1', from: 0, input, expected };
