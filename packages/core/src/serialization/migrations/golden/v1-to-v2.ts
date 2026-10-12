import type { GoldenCase } from './types';

/**
 * A real v1 document, as the editor saved it before doors could open (P3-12 to P10-01): a room
 * with a single door, a double door and a window. It stays here for ever: it is what the v1 → v2
 * migration is tested against.
 */
const input = {
  schemaVersion: 1,
  units: 'm',
  rooms: {
    r1: {
      id: 'r1',
      name: 'Studio',
      shape: { kind: 'rect', width: 4, depth: 3.5 },
      height: 2.6,
      origin: [-2, -1.75],
      floor: { material: { presetId: 'floor.oak' } },
      ceiling: { material: { presetId: 'paint.matte' } },
      walls: {
        north: { material: { presetId: 'paint.matte' } },
        east: { material: { presetId: 'paint.matte', tint: '#d9e4ec' } },
        south: { material: { presetId: 'paint.matte' } },
        west: { material: { presetId: 'paint.matte' } },
      },
    },
  },
  roomOrder: ['r1'],
  openings: {
    d1: {
      id: 'd1',
      roomId: 'r1',
      wall: 'south',
      kind: 'door',
      variant: 'door.single',
      offset: 0.3,
      width: 0.9,
      height: 2.1,
      sill: 0,
    },
    d2: {
      id: 'd2',
      roomId: 'r1',
      wall: 'east',
      kind: 'door',
      variant: 'door.double',
      offset: 1,
      width: 1.6,
      height: 2.1,
      sill: 0,
    },
    w1: {
      id: 'w1',
      roomId: 'r1',
      wall: 'north',
      kind: 'window',
      variant: 'window.standard',
      offset: 1.5,
      width: 1,
      height: 1.2,
      sill: 0.9,
    },
  },
  objects: {
    o1: {
      id: 'o1',
      catalogId: 'desk.gaming.160',
      roomId: 'r1',
      parentId: null,
      transform: { position: [2, 0, 0.4], rotationY: 0 },
      materials: {},
      locked: false,
      hidden: false,
    },
  },
  objectOrder: ['o1'],
  lighting: { mode: 'night', ambient: 0.3, sunAzimuth: 135 },
};

const expected = {
  ...input,
  schemaVersion: 2,
  openings: {
    d1: { ...input.openings.d1, swing: 'in', hinge: 'left', open: 0 },
    d2: { ...input.openings.d2, swing: 'in', hinge: 'left', open: 0 },
    w1: input.openings.w1,
  },
};

export const v1ToV2: GoldenCase = { name: 'v1-to-v2', from: 1, input, expected };
