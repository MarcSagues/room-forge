import type { WallId, WallMode } from '@roomforge/core';

/** Opacity of a wall fully faded in cutaway mode: a hint of the wall stays visible. */
export const FADED_OPACITY = 0.12;
/** Facing values (dot product) between which a wall goes from opaque to faded. */
export const FADE_START = 0.15;
export const FADE_END = 0.45;
/** Height walls are cut to in down mode, in metres. */
export const DOWN_WALL_HEIGHT = 0.6;
/** How long a wall takes to fade or to change height. */
export const WALL_TRANSITION_MS = 200;

/** Inward normals (towards the room interior) on the floor plane, as `[x, z]`. */
const INWARD: Readonly<Record<WallId, readonly [number, number]>> = {
  north: [0, 1],
  east: [-1, 0],
  south: [0, -1],
  west: [1, 0],
};

/**
 * How much a wall faces the camera: the dot product of its inward normal with the horizontal view
 * direction. 1 when it stands right between the camera and the room, −1 behind the room, 0 when
 * seen edge-on or from straight above.
 */
export function wallFacing(wall: WallId, viewX: number, viewZ: number): number {
  const length = Math.hypot(viewX, viewZ);
  if (length < 1e-6) return 0;
  const [nx, nz] = INWARD[wall];
  return (nx * viewX + nz * viewZ) / length;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Opacity a wall should have for this mode and view direction (pure; applied by `WallFader`). */
export function wallTargetOpacity(
  mode: WallMode,
  wall: WallId,
  viewX: number,
  viewZ: number,
): number {
  if (mode !== 'cutaway') return 1;
  const fade = smoothstep(FADE_START, FADE_END, wallFacing(wall, viewX, viewZ));
  return fade === 0 ? 1 : 1 - fade * (1 - FADED_OPACITY);
}

/** Vertical scale of the walls: walls start at the floor, so scaling cuts them from the top. */
export function wallHeightScale(mode: WallMode, roomHeight: number): number {
  return mode === 'down' ? Math.min(1, DOWN_WALL_HEIGHT / roomHeight) : 1;
}

/** One step of a linear transition towards `target`; `durationMs` 0 jumps (reduced motion). */
export function approach(current: number, target: number, deltaMs: number, durationMs: number) {
  if (durationMs <= 0) return target;
  const step = deltaMs / durationMs;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}
