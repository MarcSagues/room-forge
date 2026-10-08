import type { Opening, Room } from '@roomforge/core';
import { describe, expect, it } from 'vitest';
import {
  areaFacing,
  boundingBox,
  near,
  round5,
  toRoomSpace,
  triangles,
} from './geometry-test-utils';
import type { Vec3 } from './mesh-data';
import { triangleCount } from './mesh-data';
import {
  createRoomGeometryBuilder,
  holesForWall,
  type RoomGeometry,
  WALL_THICKNESS as T,
} from './room-geometry';

const surface = { material: { presetId: 'paint.matte' } };

function room(width = 4, depth = 4.5, height = 2.6): Room {
  return {
    id: 'room-1',
    name: 'Room',
    shape: { kind: 'rect', width, depth },
    height,
    origin: [-width / 2, -depth / 2],
    floor: surface,
    ceiling: surface,
    walls: { north: surface, east: surface, south: surface, west: surface },
  } as unknown as Room;
}

function opening(wall: Opening['wall'], offset: number, width = 0.9): Opening {
  return {
    id: `door-${wall}`,
    roomId: 'room-1',
    wall,
    kind: 'door',
    variant: 'door.single',
    offset,
    width,
    height: 2.1,
    sill: 0,
  } as unknown as Opening;
}

type WallName = keyof RoomGeometry['walls'];
const WALLS: WallName[] = ['north', 'east', 'south', 'west'];

/** Room-space bounding box of one wall body. */
function worldBox(geometry: RoomGeometry, wall: WallName) {
  const placement = geometry.walls[wall];
  const { point } = toRoomSpace(placement.position, placement.rotationY);
  return boundingBox(placement.mesh, point);
}

describe('buildRoomGeometry: orientation of the four walls (DOMAIN_MODEL §1)', () => {
  const build = createRoomGeometryBuilder();
  const geometry = build(room(), []);
  const [W, D] = [4, 4.5];

  // Interior face of each wall in room space: a point on it and the direction it must look at.
  const expected: Record<WallName, { plane: 0 | 2; at: number; normal: Vec3 }> = {
    north: { plane: 2, at: 0, normal: [0, 0, 1] },
    south: { plane: 2, at: D, normal: [0, 0, -1] },
    west: { plane: 0, at: 0, normal: [1, 0, 0] },
    east: { plane: 0, at: W, normal: [-1, 0, 0] },
  };

  it.each(WALLS)(
    '%s wall: interior face is on the interior boundary and looks into the room',
    (wall) => {
      const placement = geometry.walls[wall];
      const { point, direction } = toRoomSpace(placement.position, placement.rotationY);
      const interior = triangles(placement.mesh).filter(
        (t) => t.declared[2] === 1 && [t.a, t.b, t.c].every((p) => near(p[2], 0)),
      );
      expect(interior.length).toBeGreaterThan(0);
      const want = expected[wall];
      for (const tri of interior) {
        for (const p of [tri.a, tri.b, tri.c]) expect(point(p)[want.plane]).toBeCloseTo(want.at, 5);
        const n = direction(tri.declared);
        for (let k = 0; k < 3; k += 1)
          expect(n[k] as number).toBeCloseTo(want.normal[k] as number, 5);
      }
    },
  );

  it('the four wall bodies tile the ring around the interior with no gap and no overlap', () => {
    const north = worldBox(geometry, 'north');
    const south = worldBox(geometry, 'south');
    const west = worldBox(geometry, 'west');
    const east = worldBox(geometry, 'east');
    const round = (box: { min: number[]; max: number[] }) => ({
      min: box.min.map(round5),
      max: box.max.map(round5),
    });
    expect(round(north)).toEqual({ min: [-T, 0, -T], max: [W + T, 2.6, 0] });
    expect(round(south)).toEqual({ min: [-T, 0, D], max: [W + T, 2.6, D + T] });
    expect(round(west)).toEqual({ min: [-T, 0, 0], max: [0, 2.6, D] });
    expect(round(east)).toEqual({ min: [W, 0, 0], max: [W + T, 2.6, D] });
  });

  it('floor and ceiling cover exactly the interior', () => {
    expect(boundingBox(geometry.floor)).toEqual({ min: [0, 0, 0], max: [W, 0, D] });
    expect(boundingBox(geometry.ceiling)).toEqual({ min: [0, 2.6, 0], max: [W, 2.6, D] });
  });
});

describe('buildRoomGeometry across the allowed sizes', () => {
  it.each([
    [2, 2, 2.2],
    [12, 12, 4],
    [2, 12, 3],
    [12, 2, 2.6],
  ])('%s × %s m, height %s: complete, 52 triangles, no stray geometry', (w, d, h) => {
    const g = createRoomGeometryBuilder()(room(w, d, h), []);
    const total = [g.floor, g.ceiling, ...WALLS.map((n) => g.walls[n].mesh)].reduce(
      (s, m) => s + triangleCount(m),
      0,
    );
    expect(total).toBe(2 + 2 + 4 * 12);
    const outer = WALLS.map((n) => worldBox(g, n));
    expect(Math.min(...outer.map((b) => b.min[0]))).toBeCloseTo(-T, 5);
    expect(Math.max(...outer.map((b) => b.max[0]))).toBeCloseTo(w + T, 5);
    expect(Math.min(...outer.map((b) => b.min[2]))).toBeCloseTo(-T, 5);
    expect(Math.max(...outer.map((b) => b.max[2]))).toBeCloseTo(d + T, 5);
    expect(Math.max(...outer.map((b) => b.max[1]))).toBeCloseTo(h, 5);
  });
});

describe('openings (offsets run clockwise seen from above, from the wall start)', () => {
  const [W, D] = [4, 4.5];

  /** Room-space x/z span of the reveal quads (hole sides) of a wall. */
  function holeSpan(wall: WallName, geometry: RoomGeometry, axis: 0 | 2) {
    const placement = geometry.walls[wall];
    const { point } = toRoomSpace(placement.position, placement.rotationY);
    const values = triangles(placement.mesh)
      .filter(
        (t) =>
          t.declared[0] !== 0 &&
          ![t.a, t.b, t.c].every(
            (p) =>
              near(p[0], 0) ||
              near(
                p[0],
                placement.mesh.positions.reduce((m, v, i) => (i % 3 === 0 ? Math.max(m, v) : m), 0),
              ),
          ),
      )
      .flatMap((t) => [t.a, t.b, t.c].map((p) => point(p)[axis]));
    return [Math.min(...values), Math.max(...values)].map((v) => Math.round(v * 1e5) / 1e5);
  }

  const build = createRoomGeometryBuilder();
  const cases: Array<[WallName, 0 | 2, number[]]> = [
    ['north', 0, [0.5, 1.4]], // from the NW corner heading east
    ['south', 0, [W - 1.4, W - 0.5]], // from the SE corner heading west
    ['east', 2, [0.5, 1.4]], // from the NE corner heading south
    ['west', 2, [D - 1.4, D - 0.5]], // from the SW corner heading north
  ];
  it.each(cases)('%s wall: the hole lands where the offset says', (wall, axis, expectedSpan) => {
    const geometry = build(room(W, D), [opening(wall, 0.5)]);
    expect(holeSpan(wall, geometry, axis)).toEqual(expectedSpan);
  });

  it('removes the hole area from the interior face', () => {
    const geometry = build(room(W, D), [opening('south', 0.5)]);
    const placement = geometry.walls.south;
    const length = W + 2 * T;
    expect(areaFacing(placement.mesh, [0, 0, 1], { axis: 2, value: 0 })).toBeCloseTo(
      length * 2.6 - 0.9 * 2.1,
      5,
    );
  });

  it('maps offsets to wall-local holes (north/south shift by one thickness)', () => {
    const open = [opening('north', 0.5), opening('east', 1)];
    expect(holesForWall('north', open, T)).toEqual([{ u0: T + 0.5, u1: T + 1.4, v0: 0, v1: 2.1 }]);
    expect(holesForWall('east', open, T)).toEqual([{ u0: 1, u1: 1.9, v0: 0, v1: 2.1 }]);
    expect(holesForWall('south', open, T)).toEqual([]);
  });

  it('orders several openings along the wall', () => {
    const open = [opening('north', 2.5), opening('north', 0.2)];
    expect(holesForWall('north', open, T).map((h) => h.u0)).toEqual([T + 0.2, T + 2.5]);
  });
});

describe('memoization (changing dimensions only rebuilds what changed)', () => {
  it('builds each distinct mesh once and shares equal ones between walls', () => {
    const build = createRoomGeometryBuilder();
    const g = build(room(4, 4.5), []);
    expect(build.stats.builds).toEqual({ floor: 1, ceiling: 1, wall: 2 }); // N=S and E=W
    expect(g.walls.north.mesh).toBe(g.walls.south.mesh);
    expect(g.walls.east.mesh).toBe(g.walls.west.mesh);
  });

  it('building the same room again generates nothing and returns the same meshes', () => {
    const build = createRoomGeometryBuilder();
    const first = build(room(), []);
    const again = build(room(), []);
    expect(build.stats.builds).toEqual({ floor: 1, ceiling: 1, wall: 2 });
    expect(again.floor).toBe(first.floor);
    expect(again.walls.east.mesh).toBe(first.walls.east.mesh);
  });

  it('a new width rebuilds floor, ceiling and the north/south wall, but reuses east/west', () => {
    const build = createRoomGeometryBuilder();
    const before = build(room(4, 4.5), []);
    const after = build(room(5, 4.5), []);
    expect(build.stats.builds).toEqual({ floor: 2, ceiling: 2, wall: 3 });
    expect(after.walls.east.mesh).toBe(before.walls.east.mesh);
    expect(after.walls.north.mesh).not.toBe(before.walls.north.mesh);
    // the east wall keeps its mesh but moves with the room
    expect(after.walls.east.position).toEqual([5, 0, 0]);
  });

  it('a new depth rebuilds floor, ceiling and the east/west wall, but reuses north/south', () => {
    const build = createRoomGeometryBuilder();
    const before = build(room(4, 4.5), []);
    const after = build(room(4, 5), []);
    expect(build.stats.builds).toEqual({ floor: 2, ceiling: 2, wall: 3 });
    expect(after.walls.north.mesh).toBe(before.walls.north.mesh);
  });

  it('a new height rebuilds the ceiling and every wall but not the floor', () => {
    const build = createRoomGeometryBuilder();
    build(room(4, 4.5, 2.6), []);
    build(room(4, 4.5, 3), []);
    expect(build.stats.builds).toEqual({ floor: 1, ceiling: 2, wall: 4 });
  });

  it('an opening rebuilds only the wall it is on', () => {
    const build = createRoomGeometryBuilder();
    const before = build(room(), []);
    const after = build(room(), [opening('south', 0.5)]);
    expect(build.stats.builds).toEqual({ floor: 1, ceiling: 1, wall: 3 });
    expect(after.walls.north.mesh).toBe(before.walls.north.mesh);
    expect(after.walls.south.mesh).not.toBe(before.walls.south.mesh);
  });

  it('keeps the cache bounded: very old entries are evicted and rebuilt', () => {
    const build = createRoomGeometryBuilder();
    for (let i = 0; i < 100; i += 1) build(room(2 + i / 10, 3), []);
    const floors = build.stats.builds.floor;
    build(room(2, 3), []); // the very first size
    expect(build.stats.builds.floor).toBe(floors + 1);
    build(room(2 + 99 / 10, 3), []); // the latest is still cached
    expect(build.stats.builds.floor).toBe(floors + 1);
  });
});
