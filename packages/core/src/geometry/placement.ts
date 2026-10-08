import type { Vec2, WallId } from '../domain';
import {
  type BackFace,
  backFaceRotation,
  footprintExtents,
  GEOMETRY_TOLERANCE,
  snapAngle,
  snapToGrid,
} from './basics';

/** Distance from a wall at which a dragged footprint snaps to it. */
export const WALL_SNAP_DISTANCE = 0.15;

export interface PlacementInput {
  room: { width: number; depth: number };
  /** Footprint of the object (catalog size × scale), in metres. */
  size: { w: number; d: number };
  /** Candidate centre in room-local coordinates (e.g. where the pointer ray meets the floor). */
  position: readonly [number, number];
  rotationY: number;
  /** Grid snap step in metres; omit to place freely. */
  gridStep?: number;
  /** Rotation snap step in degrees; omit for free rotation. */
  angleStepDeg?: number;
  /** Turn the object's back to a wall closer than 15 cm (default true). */
  wallSnap?: boolean;
  backFace?: BackFace;
}

/** Visual hints for the UI: the wall line the object snapped to (a dashed accent line + label). */
export interface WallGuide {
  kind: 'wall';
  wall: WallId;
  from: Vec2;
  to: Vec2;
}
export type PlacementGuide = WallGuide;

export type PlacementReason = 'too-large';

export interface PlacementResult {
  position: Vec2;
  rotationY: number;
  /** False only when the footprint cannot fit in the room at all. */
  valid: boolean;
  reason: PlacementReason | null;
  /** Wall the object was snapped against, if any. */
  wall: WallId | null;
  guides: PlacementGuide[];
}

/** Inward normals of the walls on the floor plane. */
const WALLS: readonly { wall: WallId; inward: readonly [number, number] }[] = [
  { wall: 'north', inward: [0, 1] },
  { wall: 'south', inward: [0, -1] },
  { wall: 'west', inward: [1, 0] },
  { wall: 'east', inward: [-1, 0] },
];

const extents: Vec2 = [0, 0];

/** Gap between the footprint (centred at `x, z`, half extents `ex, ez`) and a wall; < 0 = crossing. */
function gapTo(wall: WallId, x: number, z: number, room: PlacementInput['room']): number {
  const [ex, ez] = extents;
  if (wall === 'north') return z - ez;
  if (wall === 'south') return room.depth - (z + ez);
  if (wall === 'west') return x - ex;
  return room.width - (x + ex);
}

function emptyResult(): PlacementResult {
  return { position: [0, 0], rotationY: 0, valid: true, reason: null, wall: null, guides: [] };
}

/**
 * Turns a candidate pose into a legal one: angle and grid snap, wall snap (back face against the
 * nearest wall within 15 cm, turned to face the room), then clamped so the footprint stays in the
 * room. Pass `out` to reuse a result object on the hot path.
 */
export function solvePlacement(input: PlacementInput, out: PlacementResult = emptyResult()) {
  const { room, size } = input;
  const step = input.gridStep;
  let rotation =
    input.angleStepDeg === undefined
      ? input.rotationY
      : snapAngle(input.rotationY, input.angleStepDeg);
  // The wall is detected on the raw position: snapping to the grid first could pull the object
  // out of the 15 cm band and make the result unstable.
  let x = input.position[0];
  let z = input.position[1];
  out.guides.length = 0;
  const snapped = input.wallSnap === false ? null : pickWall(input, x, z, rotation);
  out.wall = snapped?.wall ?? null;

  if (snapped) {
    rotation = snapped.rotation;
    footprintExtents(size.w, size.d, rotation, extents);
    // Back face on the wall plane, centre half a depth into the room; the grid applies along it.
    if (out.wall === 'north' || out.wall === 'south') {
      z = out.wall === 'north' ? extents[1] : room.depth - extents[1];
      if (step !== undefined) x = snapToGrid(x, step);
    } else {
      x = out.wall === 'west' ? extents[0] : room.width - extents[0];
      if (step !== undefined) z = snapToGrid(z, step);
    }
  } else if (step !== undefined) {
    x = snapToGrid(x, step);
    z = snapToGrid(z, step);
  }

  footprintExtents(size.w, size.d, rotation, extents);
  const [ex, ez] = extents;
  const fits =
    2 * ex <= room.width + GEOMETRY_TOLERANCE && 2 * ez <= room.depth + GEOMETRY_TOLERANCE;
  out.valid = fits;
  out.reason = fits ? null : 'too-large';
  // The coordinate the wall snap set is the contact with the wall: never move it onto the grid.
  const wallSetsX = out.wall === 'west' || out.wall === 'east';
  const wallSetsZ = out.wall === 'north' || out.wall === 'south';
  out.position[0] = fits ? clampOnGrid(x, ex, room.width - ex, wallSetsX ? undefined : step) : x;
  out.position[1] = fits ? clampOnGrid(z, ez, room.depth - ez, wallSetsZ ? undefined : step) : z;
  out.rotationY = rotation;
  if (out.wall) out.guides.push(wallGuide(out.wall, room));
  return out;
}

/**
 * The wall to snap to: within 15 cm, smallest gap first; on a tie, the wall the object already
 * faces (so solving a snapped pose again is stable). Walls the object could not face without
 * leaving the room (too long once turned) are skipped.
 */
function pickWall(input: PlacementInput, x: number, z: number, rotation: number) {
  const { room, size } = input;
  const backFace = input.backFace ?? 'z-';
  footprintExtents(size.w, size.d, rotation, extents);
  let best: { wall: WallId; rotation: number; gap: number; facing: boolean } | null = null;
  for (const { wall, inward } of WALLS) {
    const gap = gapTo(wall, x, z, room);
    if (gap > WALL_SNAP_DISTANCE) continue;
    const target = backFaceRotation(backFace, [-inward[0], -inward[1]]);
    if (!fitsTurned(size, target, room)) continue;
    const facing = Math.cos(target - rotation) > 1 - 1e-9;
    if (best) {
      const closer = gap < best.gap - GEOMETRY_TOLERANCE;
      const tie = Math.abs(gap - best.gap) <= GEOMETRY_TOLERANCE;
      if (!closer && !(tie && facing && !best.facing)) continue;
    }
    best = { wall, rotation: target, gap, facing };
  }
  return best;
}

const turned: Vec2 = [0, 0];

function fitsTurned(size: PlacementInput['size'], rotation: number, room: PlacementInput['room']) {
  footprintExtents(size.w, size.d, rotation, turned);
  return (
    2 * turned[0] <= room.width + GEOMETRY_TOLERANCE &&
    2 * turned[1] <= room.depth + GEOMETRY_TOLERANCE
  );
}

/**
 * Clamps into `[min, max]`; with a grid, to the nearest grid value inside the range when there is
 * one, so the result is still on the grid and solving it again does not move it.
 */
function clampOnGrid(value: number, min: number, max: number, step: number | undefined): number {
  const clamped = Math.min(Math.max(value, min), max);
  if (step === undefined || clamped === value) return clamped;
  const low = snapToGrid(Math.ceil((min - GEOMETRY_TOLERANCE) / step) * step, step);
  const high = snapToGrid(Math.floor((max + GEOMETRY_TOLERANCE) / step) * step, step);
  // No grid line fits (the object is within a step of the room size): centre it, whichever
  // side it was pushed from, so the result does not depend on the starting point.
  if (low > high) return (min + max) / 2;
  return clamped === min ? low : high;
}

function wallGuide(wall: WallId, room: PlacementInput['room']): WallGuide {
  const { width, depth } = room;
  if (wall === 'north') return { kind: 'wall', wall, from: [0, 0], to: [width, 0] };
  if (wall === 'south') return { kind: 'wall', wall, from: [0, depth], to: [width, depth] };
  if (wall === 'west') return { kind: 'wall', wall, from: [0, 0], to: [0, depth] };
  return { kind: 'wall', wall, from: [width, 0], to: [width, depth] };
}
