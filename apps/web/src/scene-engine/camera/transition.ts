import type { Pose } from './framing';

/** Duration of a camera move; the view switch must finish in 600 ms at most. */
export const TRANSITION_MS = 450;

/** A camera state that can be written in place every frame (no allocations in the hot path). */
export interface ViewState {
  position: [number, number, number];
  target: [number, number, number];
  /** Orthographic zoom in pixels per metre; ignored by the perspective camera. */
  zoom: number;
}

export function viewFromPose(pose: Pose, zoom = 1): ViewState {
  return {
    position: [pose.position[0], pose.position[1], pose.position[2]],
    target: [pose.target[0], pose.target[1], pose.target[2]],
    zoom,
  };
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wraps an angle difference into (−π, π] so that a turn takes the short way round. */
const shortestTurn = (delta: number) => delta - 2 * Math.PI * Math.round(delta / (2 * Math.PI));

/**
 * Blends two views into `out`: the target moves in a straight line, the camera orbits it (radius,
 * elevation and azimuth interpolate), and the zoom interpolates geometrically so it feels uniform.
 */
export function blendView(from: ViewState, to: ViewState, t: number, out: ViewState): void {
  const fx = from.position[0] - from.target[0];
  const fy = from.position[1] - from.target[1];
  const fz = from.position[2] - from.target[2];
  const tx = to.position[0] - to.target[0];
  const ty = to.position[1] - to.target[1];
  const tz = to.position[2] - to.target[2];

  const fromRadius = Math.hypot(fx, fy, fz);
  const toRadius = Math.hypot(tx, ty, tz);
  const fromPolar = fromRadius > 0 ? Math.acos(fy / fromRadius) : 0;
  const toPolar = toRadius > 0 ? Math.acos(ty / toRadius) : 0;
  const fromAzimuth = Math.atan2(fx, fz);
  const toAzimuth = Math.atan2(tx, tz);

  const radius = lerp(fromRadius, toRadius, t);
  const polar = lerp(fromPolar, toPolar, t);
  const azimuth = fromAzimuth + shortestTurn(toAzimuth - fromAzimuth) * t;

  out.target[0] = lerp(from.target[0], to.target[0], t);
  out.target[1] = lerp(from.target[1], to.target[1], t);
  out.target[2] = lerp(from.target[2], to.target[2], t);
  const horizontal = radius * Math.sin(polar);
  out.position[0] = out.target[0] + horizontal * Math.sin(azimuth);
  out.position[1] = out.target[1] + radius * Math.cos(polar);
  out.position[2] = out.target[2] + horizontal * Math.cos(azimuth);
  out.zoom = from.zoom * (to.zoom / from.zoom) ** t;
}
