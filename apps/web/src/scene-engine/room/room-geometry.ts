import type { DeepReadonly, Opening, Room, WallId } from '@roomforge/core';
import type { MeshData, Vec3 } from './mesh-data';
import { buildCeilingMesh, buildFloorMesh } from './surface-meshes';
import { buildWallMesh, type WallHole } from './wall-mesh';

/** Wall thickness in metres. Walls grow *outward* from the interior, so room dimensions stay clear dimensions. */
export const WALL_THICKNESS = 0.1;

export interface WallPlacement {
  /** Shared and cached: treat as immutable. */
  readonly mesh: MeshData;
  /** Position of the wall frame in room-local space (origin = north-west interior corner). */
  readonly position: Vec3;
  readonly rotationY: number;
}

export interface RoomGeometry {
  readonly floor: MeshData;
  readonly ceiling: MeshData;
  readonly walls: Readonly<Record<WallId, WallPlacement>>;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export interface BuilderStats {
  /** Meshes actually generated (cache misses), per kind. */
  readonly builds: { floor: number; ceiling: number; wall: number };
}

export interface RoomGeometryBuilder {
  (room: DeepReadonly<Room>, openings: readonly DeepReadonly<Opening>[]): RoomGeometry;
  readonly stats: BuilderStats;
}

const CACHE_LIMIT = 48;

/** Tiny bounded memo table: oldest entry out. Walls with equal parameters share one mesh. */
function memo<T>(limit: number) {
  const table = new Map<string, T>();
  return (key: string, make: () => T, onMiss: () => void): T => {
    const hit = table.get(key);
    if (hit) return hit;
    onMiss();
    const value = make();
    table.set(key, value);
    if (table.size > limit) table.delete(table.keys().next().value as string);
    return value;
  };
}

/**
 * Wall-local holes for the openings of one wall. `offset` is measured clockwise (seen from above)
 * from the wall's starting interior corner; north/south frames are `2 × thickness` longer than the
 * interior because they cover the corners, which shifts their holes by one thickness.
 */
export function holesForWall(
  wall: WallId,
  openings: readonly DeepReadonly<Opening>[],
  thickness: number,
): WallHole[] {
  const shift = wall === 'north' || wall === 'south' ? thickness : 0;
  return openings
    .filter((opening) => opening.wall === wall)
    .map((opening) => ({
      u0: shift + opening.offset,
      u1: shift + opening.offset + opening.width,
      v0: opening.sill,
      v1: opening.sill + opening.height,
    }))
    .sort((a, b) => a.u0 - b.u0);
}

const holesKey = (holes: readonly WallHole[]) =>
  holes.map((h) => `${h.u0},${h.u1},${h.v0},${h.v1}`).join(';');

/**
 * Builds the geometry of a rectangular room (DOMAIN_MODEL §1: the interior is
 * `x ∈ [0, width]`, `z ∈ [0, depth]`, north is −z). Meshes are generated in local frames and cached
 * by their parameters, so changing the width only rebuilds the floor, ceiling and north/south
 * walls; the east/west walls are reused and just move.
 */
export function createRoomGeometryBuilder(thickness: number = WALL_THICKNESS): RoomGeometryBuilder {
  const floors = memo<MeshData>(CACHE_LIMIT);
  const ceilings = memo<MeshData>(CACHE_LIMIT);
  const walls = memo<MeshData>(CACHE_LIMIT);
  const builds = { floor: 0, ceiling: 0, wall: 0 };

  const build = (
    room: DeepReadonly<Room>,
    openings: readonly DeepReadonly<Opening>[],
  ): RoomGeometry => {
    const { width, depth } = room.shape;
    const { height } = room;
    const t = thickness;
    const wallMesh = (wall: WallId, length: number) => {
      const holes = holesForWall(wall, openings, t);
      return walls(
        `${length}|${height}|${t}|${holesKey(holes)}`,
        () => buildWallMesh(length, height, t, holes),
        () => {
          builds.wall += 1;
        },
      );
    };
    const ns = width + 2 * t;
    return {
      width,
      depth,
      height,
      floor: floors(
        `${width}|${depth}`,
        () => buildFloorMesh(width, depth),
        () => {
          builds.floor += 1;
        },
      ),
      ceiling: ceilings(
        `${width}|${depth}|${height}`,
        () => buildCeilingMesh(width, depth, height),
        () => {
          builds.ceiling += 1;
        },
      ),
      walls: {
        north: { mesh: wallMesh('north', ns), position: [-t, 0, 0], rotationY: 0 },
        south: { mesh: wallMesh('south', ns), position: [width + t, 0, depth], rotationY: Math.PI },
        west: { mesh: wallMesh('west', depth), position: [0, 0, depth], rotationY: Math.PI / 2 },
        east: { mesh: wallMesh('east', depth), position: [width, 0, 0], rotationY: -Math.PI / 2 },
      },
    };
  };

  return Object.assign(build, { stats: { builds } as BuilderStats });
}

/** Shared builder used by the scene. */
export const buildRoomGeometry = createRoomGeometryBuilder();
