/**
 * Placement maths shared by the drag/rotate controllers and the invariants. Pure, three-free, in
 * room-local metres: `x ∈ [0, width]`, `z ∈ [0, depth]`, Y up, rotation about +Y as in three.js.
 * Hot-path variants write into an `out` tuple (`Vec2` = `[x, z]`) instead of allocating.
 */

import type { Vec2 } from '../domain';

/** Slack for floating-point rounding in geometric checks: 1 mm. */
export const GEOMETRY_TOLERANCE = 0.001;

/** Grid sizes offered by the snap control, in metres. */
export const GRID_STEPS = [0.05, 0.1, 0.25, 0.5] as const;
/** Angle steps for rotation snapping, in degrees. */
export const ANGLE_STEPS_DEG = [15, 45, 90] as const;

const TAU = Math.PI * 2;

/** Nearest multiple of `step`. Idempotent; never returns -0. */
export function snapToGrid(value: number, step: number): number {
  const snapped = Math.round(value / step) * step;
  return snapped === 0 ? 0 : snapped;
}

/** Same angle in (-π, π]. */
export function normalizeAngle(angle: number): number {
  let a = angle % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a === 0 ? 0 : a;
}

/** Nearest multiple of `stepDeg`, normalised to (-π, π]. Idempotent. */
export function snapAngle(angle: number, stepDeg: number): number {
  const step = (stepDeg * Math.PI) / 180;
  const k = Math.round(normalizeAngle(angle) / step);
  // Rebuild from the integer index so a second snap lands on exactly the same float.
  return normalizeAngle(k * step);
}

/**
 * Half extents along x and z of a `w × d` rectangle turned by `rotationY` (its axis-aligned
 * bounding box on the floor), written into `out`.
 */
export function footprintExtents(w: number, d: number, rotationY: number, out: Vec2): Vec2 {
  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));
  out[0] = (cos * w + sin * d) / 2;
  out[1] = (sin * w + cos * d) / 2;
  return out;
}

const scratch: Vec2 = [0, 0];

/** True when the turned footprint centred at `(x, z)` lies inside the room (1 mm slack). */
export function footprintInside(
  room: { width: number; depth: number },
  x: number,
  z: number,
  w: number,
  d: number,
  rotationY: number,
): boolean {
  const [ex, ez] = footprintExtents(w, d, rotationY, scratch);
  const t = GEOMETRY_TOLERANCE;
  return x - ex >= -t && z - ez >= -t && x + ex <= room.width + t && z + ez <= room.depth + t;
}

/** Which face of a catalog model rests against a wall (DOMAIN_MODEL §3.1); models face +z. */
export type BackFace = 'z+' | 'z-' | 'x+' | 'x-';

const BACK_FACE_DIRECTION: Readonly<Record<BackFace, readonly [number, number]>> = {
  'z+': [0, 1],
  'z-': [0, -1],
  'x+': [1, 0],
  'x-': [-1, 0],
};

/**
 * Rotation about Y that turns the model's `backFace` to point along the floor direction `world`.
 * A three.js rotation by θ adds θ to a direction's angle measured as `atan2(x, z)`.
 */
export function backFaceRotation(backFace: BackFace, world: readonly [number, number]): number {
  const [bx, bz] = BACK_FACE_DIRECTION[backFace];
  return normalizeAngle(Math.atan2(world[0], world[1]) - Math.atan2(bx, bz));
}

/**
 * Where a ray meets the horizontal plane `y = planeY` (the floor, or a tabletop), written into
 * `out` as `[x, z]`. False (and `out` untouched) when the ray is parallel or points away.
 */
export function intersectRayFloor(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  planeY: number,
  out: Vec2,
): boolean {
  const dy = direction[1];
  if (Math.abs(dy) < 1e-9) return false;
  const t = (planeY - origin[1]) / dy;
  if (t < 0) return false;
  out[0] = origin[0] + direction[0] * t;
  out[1] = origin[2] + direction[2] * t;
  return true;
}
