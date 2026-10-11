import type { Lighting } from '../domain';

/**
 * Day and night (P5-06, ARCHITECTURE §6.5): the parameters of the scene's global lights for each
 * mode, the transition between them and where the sun stands. Pure numbers: the scene engine
 * copies them into three.js lights every frame of a transition, so nothing here allocates once
 * the output objects exist.
 */

export type LightingMode = Lighting['mode'];

/** How long switching between day and night takes (ms); instant with reduced motion. */
export const DAY_NIGHT_TRANSITION_MS = 700;
/** Height of the sun over the horizon (degrees): high, so it lights a closed room from above. */
export const SUN_ELEVATION_DEG = 60;

/** A colour as three sRGB channels in 0..1. */
export type Rgb01 = [number, number, number];

/** The global lighting at one moment, between full day and full night. */
export interface LightingLook {
  /** Hemisphere light: sky and ground colours and its intensity. */
  sky: Rgb01;
  ground: Rgb01;
  hemisphere: number;
  /**
   * The sun by day and a faint moon by night: the same light, in the same place, so its shadow
   * never needs redrawing because the mode changed.
   */
  sunColor: Rgb01;
  sun: number;
  /** Strength of the procedural environment (reflections and soft fill). */
  environment: number;
  /** What the window glass shows of the outside, how bright, and how opaque (sky over glass). */
  window: Rgb01;
  windowGlow: number;
  windowOpacity: number;
}

const rgb = (hex: string): Rgb01 => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};

export const LIGHTING_LOOKS: Readonly<Record<LightingMode, Readonly<LightingLook>>> = {
  day: {
    sky: rgb('#eef4ff'),
    ground: rgb('#8d939c'),
    hemisphere: 0.75,
    sunColor: rgb('#fff3e0'),
    sun: 3.2,
    environment: 0.45,
    window: rgb('#bfdcff'),
    windowGlow: 0.9,
    windowOpacity: 0.85,
  },
  night: {
    sky: rgb('#2a3654'),
    ground: rgb('#0b0d12'),
    hemisphere: 0.16,
    sunColor: rgb('#9fb6ff'),
    sun: 0.12,
    environment: 0.04,
    window: rgb('#101a33'),
    windowGlow: 0.25,
    windowOpacity: 0.7,
  },
};

/** Where a mode sits on the transition: day is 0, night is 1. */
export function modeLevel(mode: LightingMode): number {
  return mode === 'night' ? 1 : 0;
}

/** Moves `level` towards `target` at a constant rate that crosses 0..1 in `durationMs`. */
export function stepLevel(
  level: number,
  target: number,
  elapsedMs: number,
  durationMs: number,
): number {
  if (durationMs <= 0) return target;
  const step = Math.max(0, elapsedMs) / durationMs;
  return level < target ? Math.min(target, level + step) : Math.max(target, level - step);
}

/** Smoothstep: the transition starts and ends gently. */
export function easeLevel(level: number): number {
  const t = Math.min(1, Math.max(0, level));
  return t * t * (3 - 2 * t);
}

export function createLook(): LightingLook {
  return {
    sky: [0, 0, 0],
    ground: [0, 0, 0],
    hemisphere: 0,
    sunColor: [0, 0, 0],
    sun: 0,
    environment: 0,
    window: [0, 0, 0],
    windowGlow: 0,
    windowOpacity: 0,
  };
}

const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

function mixRgb(out: Rgb01, a: Readonly<Rgb01>, b: Readonly<Rgb01>, t: number): void {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
}

/** The look at a transition `level` (eased), written into `out` and returned. */
export function mixLook(level: number, out: LightingLook): LightingLook {
  const { day, night } = LIGHTING_LOOKS;
  const t = easeLevel(level);
  mixRgb(out.sky, day.sky, night.sky, t);
  mixRgb(out.ground, day.ground, night.ground, t);
  mixRgb(out.sunColor, day.sunColor, night.sunColor, t);
  mixRgb(out.window, day.window, night.window, t);
  out.hemisphere = lerp(day.hemisphere, night.hemisphere, t);
  out.sun = lerp(day.sun, night.sun, t);
  out.environment = lerp(day.environment, night.environment, t);
  out.windowGlow = lerp(day.windowGlow, night.windowGlow, t);
  out.windowOpacity = lerp(day.windowOpacity, night.windowOpacity, t);
  return out;
}

export type Point3 = readonly [number, number, number];

/**
 * Unit vector from the scene towards the sun. `azimuthDeg` turns clockwise seen from above, from
 * north (-z) through east (+x), like `Lighting.sunAzimuth`.
 */
export function sunDirection(
  azimuthDeg: number,
  elevationDeg: number = SUN_ELEVATION_DEG,
): [number, number, number] {
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  const flat = Math.cos(elevation);
  return [Math.sin(azimuth) * flat, Math.sin(elevation), -Math.cos(azimuth) * flat];
}

export interface Bounds3 {
  min: Point3;
  max: Point3;
}

/** Box around every room, from the floor to the tallest ceiling, grown by `margin` sideways. */
export function roomsBounds(
  rooms: Iterable<{
    readonly origin: readonly [number, number];
    readonly shape: { readonly width: number; readonly depth: number };
    readonly height: number;
  }>,
  margin: number,
): Bounds3 | null {
  let found = false;
  let x0 = Number.POSITIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  let top = 0;
  for (const room of rooms) {
    found = true;
    x0 = Math.min(x0, room.origin[0]);
    z0 = Math.min(z0, room.origin[1]);
    x1 = Math.max(x1, room.origin[0] + room.shape.width);
    z1 = Math.max(z1, room.origin[1] + room.shape.depth);
    top = Math.max(top, room.height);
  }
  if (!found) return null;
  return { min: [x0 - margin, 0, z0 - margin], max: [x1 + margin, top, z1 + margin] };
}

/** The sun's orthographic shadow camera: where it stands, what it aims at and its box. */
export interface SunFrame {
  position: [number, number, number];
  target: [number, number, number];
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

/** Room left between the bounds and the edges of the shadow camera (metres). */
const FRAME_PAD = 0.25;

/**
 * Fits the sun's shadow camera tightly around `bounds` (ARCHITECTURE §6.3: one shadow, fitted to
 * the room), so the whole shadow map lands on the room. The camera frame is the one three.js
 * builds with `lookAt` and +y up; the direction must not be vertical.
 */
export function sunShadowFrame(bounds: Bounds3, direction: Point3): SunFrame {
  const centre: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    centre[i] = ((bounds.min[i] as number) + (bounds.max[i] as number)) / 2;
  }
  const [zx, zy, zz] = direction;
  // x = normalise(up × z), y = z × x.
  const flat = Math.hypot(zz, zx);
  const xx = zz / flat;
  const xz = -zx / flat;
  const yx = zy * xz;
  const yy = zz * xx - zx * xz;
  const yz = -zy * xx;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.POSITIVE_INFINITY;
  let top = Number.NEGATIVE_INFINITY;
  let nearest = Number.NEGATIVE_INFINITY;
  let farthest = Number.POSITIVE_INFINITY;
  for (let corner = 0; corner < 8; corner += 1) {
    const px = ((corner & 1 ? bounds.max[0] : bounds.min[0]) as number) - centre[0];
    const py = ((corner & 2 ? bounds.max[1] : bounds.min[1]) as number) - centre[1];
    const pz = ((corner & 4 ? bounds.max[2] : bounds.min[2]) as number) - centre[2];
    const u = px * xx + pz * xz;
    const v = px * yx + py * yy + pz * yz;
    const w = px * zx + py * zy + pz * zz;
    left = Math.min(left, u);
    right = Math.max(right, u);
    bottom = Math.min(bottom, v);
    top = Math.max(top, v);
    nearest = Math.max(nearest, w);
    farthest = Math.min(farthest, w);
  }
  const distance = nearest + 2 * FRAME_PAD;
  return {
    position: [centre[0] + zx * distance, centre[1] + zy * distance, centre[2] + zz * distance],
    target: centre,
    left: left - FRAME_PAD,
    right: right + FRAME_PAD,
    bottom: bottom - FRAME_PAD,
    top: top + FRAME_PAD,
    near: FRAME_PAD,
    far: distance - farthest + FRAME_PAD,
  };
}
