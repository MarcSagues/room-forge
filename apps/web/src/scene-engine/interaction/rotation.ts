import { normalizeAngle, type PlacementResult, solvePlacement } from '@roomforge/core';

/** One `R` press or wheel notch turns this much (degrees); `Alt` uses the fine step. */
export const ROTATE_STEP_DEG = 15;
export const FINE_STEP_DEG = 1;

const RAD_PER_DEG = Math.PI / 180;

/** `current` turned by `steps` whole steps of `stepDeg` (negative = the other way), in (-π, π]. */
export function rotationByStep(current: number, steps: number, stepDeg: number): number {
  return normalizeAngle(current + steps * stepDeg * RAD_PER_DEG);
}

/**
 * Angle of the floor direction `(dx, dz)` measured from +z towards +x: the `rotationY` that makes
 * an object's front (+z) point that way, as in three.js.
 */
export function pointerAngle(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** A rotation as shown to people: 0–360°, to a tenth of a degree. */
export function toDegrees(rotationY: number): number {
  const degrees = (Math.round((((rotationY / RAD_PER_DEG) % 360) + 360) * 10) / 10) % 360;
  return degrees === 0 ? 0 : degrees;
}

export interface RotationInput {
  room: { width: number; depth: number };
  /** Footprint of the object (catalog size × scale), in metres. */
  size: { w: number; d: number };
  /** Centre in room-local coordinates. */
  position: readonly [number, number];
  /** The orientation wanted. */
  rotationY: number;
}

export type RotationResult = Pick<PlacementResult, 'position' | 'rotationY' | 'valid'>;

const scratch: PlacementResult = {
  position: [0, 0],
  rotationY: 0,
  valid: true,
  reason: null,
  wall: null,
  guides: [],
};
const input: {
  room: { width: number; depth: number };
  size: { w: number; d: number };
  position: [number, number];
  rotationY: number;
  wallSnap: false;
} = {
  room: { width: 0, depth: 0 },
  size: { w: 0, d: 0 },
  position: [0, 0],
  rotationY: 0,
  wallSnap: false,
};

/**
 * The pose an object ends up in when turned to `rotationY` around its centre: policy for turns
 * near walls is to **push it inwards** just enough for the turned footprint to stay in the room,
 * and to **block** the turn (`valid: false`) when it cannot fit at all. No grid or wall snap: the
 * orientation is exactly what was asked for. Fills `out`; allocates nothing.
 */
export function solveRotation(request: RotationInput, out: RotationResult): RotationResult {
  input.room.width = request.room.width;
  input.room.depth = request.room.depth;
  input.size.w = request.size.w;
  input.size.d = request.size.d;
  input.position[0] = request.position[0];
  input.position[1] = request.position[1];
  input.rotationY = request.rotationY;
  const solved = solvePlacement(input, scratch);
  out.position[0] = solved.position[0];
  out.position[1] = solved.position[1];
  out.rotationY = solved.rotationY;
  out.valid = solved.valid;
  return out;
}
