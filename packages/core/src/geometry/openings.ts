/**
 * Wall maths for placing and sliding doors and windows (P3-12). Pure and allocation-free (results
 * go into `out` objects), in room-local metres like the rest of `geometry`: the interior is
 * `x ∈ [0, width]`, `z ∈ [0, depth]`, Y up. Along a wall, `u` runs clockwise seen from above from
 * the wall's starting interior corner (DOMAIN_MODEL §1) and `v` is the height above the floor.
 */

import { LIMITS, type Vec2, type WallId } from '../domain';
import { GEOMETRY_TOLERANCE, snapToGrid } from './basics';

type Vec3In = readonly [number, number, number];

export interface RoomBox {
  readonly width: number;
  readonly depth: number;
}

export function wallLength(room: RoomBox, wall: WallId): number {
  return wall === 'north' || wall === 'south' ? room.width : room.depth;
}

/** The point `u` metres along `wall`, on its interior face, as `[x, z]` in `out`. */
export function wallPoint(room: RoomBox, wall: WallId, u: number, out: Vec2): Vec2 {
  switch (wall) {
    case 'north':
      out[0] = u;
      out[1] = 0;
      break;
    case 'east':
      out[0] = room.width;
      out[1] = u;
      break;
    case 'south':
      out[0] = room.width - u;
      out[1] = room.depth;
      break;
    case 'west':
      out[0] = 0;
      out[1] = room.depth - u;
      break;
  }
  return out;
}

/** How far along `wall` the floor point `(x, z)` is (its projection onto the wall's line). */
export function wallU(room: RoomBox, wall: WallId, x: number, z: number): number {
  return wall === 'north'
    ? x
    : wall === 'east'
      ? z
      : wall === 'south'
        ? room.width - x
        : room.depth - z;
}

export interface WallHit {
  wall: WallId;
  /** Along the wall (see the module comment). */
  u: number;
  /** Height above the floor. */
  v: number;
  /** Distance along the ray, in units of its direction. */
  t: number;
}

/**
 * Where a ray meets the (unbounded) plane of a wall's interior face. With `frontOnly`, only a ray
 * travelling into the face from the room counts: one that crosses it from outside does not.
 * False (and `out` untouched) when the ray is parallel to the wall or points away from it.
 */
export function intersectRayWall(
  room: RoomBox,
  wall: WallId,
  origin: Vec3In,
  direction: Vec3In,
  frontOnly: boolean,
  out: WallHit,
): boolean {
  const alongX = wall === 'north' || wall === 'south';
  // Distance of the plane on its axis, and the sign of the inward normal on that axis.
  const plane = wall === 'east' ? room.width : wall === 'south' ? room.depth : 0;
  const inward = wall === 'north' || wall === 'west' ? 1 : -1;
  const o = alongX ? origin[2] : origin[0];
  const d = alongX ? direction[2] : direction[0];
  if (Math.abs(d) < 1e-9) return false;
  if (frontOnly && d * inward >= 0) return false;
  const t = (plane - o) / d;
  if (t < 0) return false;
  const x = origin[0] + direction[0] * t;
  const z = origin[2] + direction[2] * t;
  out.wall = wall;
  out.u = wallU(room, wall, x, z);
  out.v = origin[1] + direction[1] * t;
  out.t = t;
  return true;
}

/** How close to a wall a floor point may be (looking straight down) for the wall to be picked. */
export const WALL_PICK_DISTANCE = 0.5;

const WALLS: readonly WallId[] = ['north', 'east', 'south', 'west'];
const scratch: WallHit = { wall: 'north', u: 0, v: 0, t: 0 };

/**
 * The wall a pointer ray designates: the nearest interior face it reaches from inside the room
 * (so the near walls of the cutaway view, crossed from outside, are skipped), within the wall's
 * length and the room's height. Looking straight down no face is reached: then the wall nearest
 * to the floor point under the pointer, if it is within `WALL_PICK_DISTANCE`.
 */
export function pickWall(
  room: RoomBox & { readonly height: number },
  origin: Vec3In,
  direction: Vec3In,
  out: WallHit,
): boolean {
  let found = false;
  for (let i = 0; i < WALLS.length; i += 1) {
    const wall = WALLS[i] as WallId;
    if (!intersectRayWall(room, wall, origin, direction, true, scratch)) continue;
    const length = wallLength(room, wall);
    const inside =
      scratch.u >= -GEOMETRY_TOLERANCE &&
      scratch.u <= length + GEOMETRY_TOLERANCE &&
      scratch.v >= -GEOMETRY_TOLERANCE &&
      scratch.v <= room.height + GEOMETRY_TOLERANCE;
    if (inside && (!found || scratch.t < out.t)) {
      out.wall = scratch.wall;
      out.u = scratch.u;
      out.v = scratch.v;
      out.t = scratch.t;
      found = true;
    }
  }
  if (found) return true;

  // Straight down (the plan view): the floor point, then the nearest wall.
  if (direction[1] >= -1e-9) return false;
  const t = -origin[1] / direction[1];
  const x = origin[0] + direction[0] * t;
  const z = origin[2] + direction[2] * t;
  let best = WALL_PICK_DISTANCE;
  for (let i = 0; i < WALLS.length; i += 1) {
    const wall = WALLS[i] as WallId;
    const distance =
      wall === 'north'
        ? Math.abs(z)
        : wall === 'south'
          ? Math.abs(room.depth - z)
          : wall === 'west'
            ? Math.abs(x)
            : Math.abs(room.width - x);
    const u = wallU(room, wall, x, z);
    if (distance > best || u < 0 || u > wallLength(room, wall)) continue;
    best = distance;
    out.wall = wall;
    out.u = u;
    out.v = 0;
    out.t = t;
    found = true;
  }
  return found;
}

/**
 * `value` snapped to `step` and kept in `[min, max]` on the grid: the nearest grid line inside,
 * or the bound itself when no grid line fits between the bounds.
 */
function slide(value: number, min: number, max: number, step: number | undefined): number {
  if (!step) return clampTo(value, min, max);
  const first = Math.ceil((min - GEOMETRY_TOLERANCE) / step) * step;
  const last = Math.floor((max + GEOMETRY_TOLERANCE) / step) * step;
  if (first > last + GEOMETRY_TOLERANCE) return clampTo(value, min, max);
  return Math.min(Math.max(snapToGrid(value, step), first), last);
}

const clampTo = (value: number, min: number, max: number) =>
  Math.max(Math.min(Math.max(value, min), max), 0);

export interface OpeningOffsetInput {
  /** Interior length of the wall. */
  length: number;
  roomHeight: number;
  width: number;
  height: number;
  sill: number;
  /** Wanted offset of the opening's starting edge along the wall. */
  offset: number;
  /** Snaps the offset to this grid along the wall (from the starting corner). */
  gridStep?: number | undefined;
  /** The other openings of the wall. */
  others: readonly { readonly offset: number; readonly width: number }[];
  /** How many entries of `others` are in use (for preallocated lists); all of them by default. */
  othersCount?: number;
}

export type OpeningOffsetReason = 'too-wide' | 'too-tall' | 'overlap';

export interface OpeningOffsetResult {
  offset: number;
  valid: boolean;
  reason: OpeningOffsetReason | null;
}

/**
 * Where an opening dragged along a wall lands, with the policy of `opening/add` and
 * `opening/move` (ARCHITECTURE §4): the offset is snapped and slid clear of the corners
 * (`LIMITS.openingCornerMargin`); it is `valid` exactly when those commands would accept it, and
 * `reason` says why not. Solving its own result changes nothing.
 */
export function solveOpeningOffset(
  input: OpeningOffsetInput,
  out: OpeningOffsetResult,
): OpeningOffsetResult {
  const margin = LIMITS.openingCornerMargin;
  const { length, width } = input;
  const offset = slide(input.offset, margin, length - margin - width, input.gridStep);
  out.offset = offset;
  out.valid = false;
  if (width > length - 2 * margin + GEOMETRY_TOLERANCE) {
    out.reason = 'too-wide';
    return out;
  }
  if (input.sill + input.height > input.roomHeight + GEOMETRY_TOLERANCE) {
    out.reason = 'too-tall';
    return out;
  }
  const count = input.othersCount ?? input.others.length;
  for (let i = 0; i < count; i += 1) {
    const other = input.others[i];
    if (!other) continue;
    const separate =
      offset + width <= other.offset + GEOMETRY_TOLERANCE ||
      other.offset + other.width <= offset + GEOMETRY_TOLERANCE;
    if (!separate) {
      out.reason = 'overlap';
      return out;
    }
  }
  out.valid = true;
  out.reason = null;
  return out;
}
