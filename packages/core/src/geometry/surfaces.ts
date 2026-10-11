import type { Vec2 } from '../domain';
import type { SupportSurface } from '../ports';
import {
  footprintExtents,
  GEOMETRY_TOLERANCE,
  normalizeAngle,
  snapAngle,
  snapToGrid,
} from './basics';
import { clampOnGrid, emptyResult, type PlacementResult } from './placement';

/**
 * Where a supporting object (a desk) stands: its base position in the frame its children's room
 * pose is wanted in (room-local, or world once the room origin is added), its turn and its scale.
 * A child's pose is stored in the support's own frame (DOMAIN_MODEL `transform`, local to the
 * parent), and the room pose is `position + R(rotationY) · (scale · local)`, as three.js nests them.
 */
export interface SupportFrame {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  sx: number;
  sy: number;
  sz: number;
}

/** A point `(lx, lz)` of the support's frame in the frame `frame` is given in. */
export function supportToRoom(frame: SupportFrame, lx: number, lz: number, out: Vec2): Vec2 {
  const cos = Math.cos(frame.rotationY);
  const sin = Math.sin(frame.rotationY);
  const x = lx * frame.sx;
  const z = lz * frame.sz;
  out[0] = frame.x + x * cos + z * sin;
  out[1] = frame.z - x * sin + z * cos;
  return out;
}

/** The inverse of `supportToRoom`: a point `(x, z)` in the support's own frame. */
export function roomToSupport(frame: SupportFrame, x: number, z: number, out: Vec2): Vec2 {
  const cos = Math.cos(frame.rotationY);
  const sin = Math.sin(frame.rotationY);
  const dx = x - frame.x;
  const dz = z - frame.z;
  out[0] = (dx * cos - dz * sin) / frame.sx;
  out[1] = (dx * sin + dz * cos) / frame.sz;
  return out;
}

export interface SupportPlacementInput {
  support: SupportSurface;
  /** Footprint of the object standing on it, in the support's frame (its own size × scale). */
  size: { w: number; d: number };
  /** Candidate centre in the support's frame. */
  position: readonly [number, number];
  /** Turn relative to the support. */
  rotationY: number;
  gridStep?: number | undefined;
  angleStepDeg?: number | undefined;
}

const extents: Vec2 = [0, 0];

/**
 * Turns a candidate pose on a support into a legal one: angle and grid snap (the grid is the
 * support's, centred on the item it belongs to), then the turned footprint clamped inside the
 * support's rectangle. `valid` is false when the footprint cannot fit on it at all. No wall snap.
 * Pass `out` to reuse a result object on the hot path.
 */
export function solveOnSupport(
  input: SupportPlacementInput,
  out: PlacementResult = emptyResult(),
): PlacementResult {
  const { rect } = input.support;
  const step = input.gridStep;
  const rotation =
    input.angleStepDeg === undefined
      ? normalizeAngle(input.rotationY)
      : snapAngle(input.rotationY, input.angleStepDeg);
  footprintExtents(input.size.w, input.size.d, rotation, extents);
  let x = input.position[0];
  let z = input.position[1];
  if (step !== undefined) {
    x = snapToGrid(x, step);
    z = snapToGrid(z, step);
  }
  const minX = rect.x - rect.w / 2 + extents[0];
  const maxX = rect.x + rect.w / 2 - extents[0];
  const minZ = rect.z - rect.d / 2 + extents[1];
  const maxZ = rect.z + rect.d / 2 - extents[1];
  const t = GEOMETRY_TOLERANCE;
  const fits = minX <= maxX + t && minZ <= maxZ + t;
  out.valid = fits;
  out.reason = fits ? null : 'too-large';
  out.position[0] = fits ? clampWithin(x, minX, maxX, step) : x;
  out.position[1] = fits ? clampWithin(z, minZ, maxZ, step) : z;
  out.rotationY = rotation;
  out.wall = null;
  out.guides.length = 0;
  return out;
}

/** Clamped into `[min, max]`, but left alone within the 1 mm slack (rounding is not a move). */
function clampWithin(value: number, min: number, max: number, step: number | undefined) {
  const t = GEOMETRY_TOLERANCE;
  if (value >= min - t && value <= max + t) return value;
  return clampOnGrid(value, min, Math.max(min, max), step);
}

const hit: Vec2 = [0, 0];

/**
 * Where a ray meets a support surface (analytic: its plane, then its rectangle). Writes the point
 * in the support's frame into `out` and returns the ray parameter (the distance along a unit
 * direction), or -1 when the ray is parallel to the plane, points away from it, or the point is off
 * the rectangle. `shift` is subtracted from the point first, in the ray's frame: the offset between
 * the grabbed point and the centre of a dragged object, so it is the centre that must land on it.
 */
export function intersectRaySupport(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  frame: SupportFrame,
  support: SupportSurface,
  out: Vec2,
  shift?: readonly [number, number],
): number {
  const dy = direction[1];
  if (Math.abs(dy) < 1e-9) return -1;
  const t = (frame.y + support.y * frame.sy - origin[1]) / dy;
  if (t < 0) return -1;
  const x = origin[0] + direction[0] * t - (shift ? shift[0] : 0);
  const z = origin[2] + direction[2] * t - (shift ? shift[1] : 0);
  roomToSupport(frame, x, z, hit);
  const { rect } = support;
  if (Math.abs(hit[0] - rect.x) > rect.w / 2 || Math.abs(hit[1] - rect.z) > rect.d / 2) return -1;
  out[0] = hit[0];
  out[1] = hit[1];
  return t;
}

/** True when the turned footprint centred at `(x, z)` lies on the support's rectangle (1 mm slack). */
export function footprintOnSupport(
  support: SupportSurface,
  x: number,
  z: number,
  w: number,
  d: number,
  rotationY: number,
): boolean {
  footprintExtents(w, d, rotationY, extents);
  const { rect } = support;
  const t = GEOMETRY_TOLERANCE;
  return (
    Math.abs(x - rect.x) + extents[0] <= rect.w / 2 + t &&
    Math.abs(z - rect.z) + extents[1] <= rect.d / 2 + t
  );
}
