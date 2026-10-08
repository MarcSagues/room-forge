import type { DeepReadonly, Room } from '@roomforge/core';

/** Pure camera maths (no three.js): where to put the camera and how far it may go. Metres, Y up. */
export type Vec3 = readonly [number, number, number];

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface Pose {
  readonly position: Vec3;
  readonly target: Vec3;
}

export interface OrbitLimits {
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly minPolarAngle: number;
  readonly maxPolarAngle: number;
  /** Where the orbit target may be panned to. */
  readonly boundary: Bounds;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** The camera never goes farther than this many room diagonals from its target. */
export const MAX_DISTANCE_FACTOR = 4;
export const MIN_DISTANCE = 0.3;
/** Just short of the horizon: with the target at or above the floor the camera never dips below it. */
export const MAX_POLAR_ANGLE = (85 * Math.PI) / 180;
const FIT_MARGIN = 1.15;
const TOP_MARGIN = 1.2;
/** Height of the plan camera above the ceiling; ortho near/far planes must contain the room. */
const TOP_CLEARANCE = 10;
/** A hair towards +z fixes the azimuth of a straight-down camera so that screen-up is north (−z). */
const TOP_TILT = 1e-3;
const FALLBACK_ZOOM = 50;

/** Default three-quarter view: from the south-east corner, about 59° above the horizon. */
const PERSPECTIVE_DIRECTION: Vec3 = [1, 0.85, 1];

const FALLBACK_BOUNDS: Bounds = { min: [-2, 0, -2.25], max: [2, 2.6, 2.25] };

type RoomExtent = DeepReadonly<Pick<Room, 'origin' | 'shape' | 'height'>>;

/** The box that contains every room (the interior volume, walls excluded). */
export function sceneBounds(rooms: readonly RoomExtent[]): Bounds {
  if (rooms.length === 0) return FALLBACK_BOUNDS;
  const min: [number, number, number] = [Infinity, 0, Infinity];
  const max: [number, number, number] = [-Infinity, 0, -Infinity];
  for (const room of rooms) {
    min[0] = Math.min(min[0], room.origin[0]);
    min[2] = Math.min(min[2], room.origin[1]);
    max[0] = Math.max(max[0], room.origin[0] + room.shape.width);
    max[1] = Math.max(max[1], room.height);
    max[2] = Math.max(max[2], room.origin[1] + room.shape.depth);
  }
  return { min, max };
}

export function boundsCenter({ min, max }: Bounds): Vec3 {
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

export function boundsDiagonal({ min, max }: Bounds): number {
  return Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
}

export function orbitLimits(bounds: Bounds): OrbitLimits {
  const diagonal = boundsDiagonal(bounds);
  const pad = diagonal / 2;
  return {
    minDistance: MIN_DISTANCE,
    maxDistance: MAX_DISTANCE_FACTOR * diagonal,
    minPolarAngle: 0,
    maxPolarAngle: MAX_POLAR_ANGLE,
    boundary: {
      min: [bounds.min[0] - pad, 0, bounds.min[2] - pad],
      max: [bounds.max[0] + pad, bounds.max[1], bounds.max[2] + pad],
    },
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Brings a pose back inside the limits: target in the boundary, distance and elevation in range. */
export function constrainPose(pose: Pose, limits: OrbitLimits): Pose {
  const { boundary } = limits;
  const target: Vec3 = [
    clamp(pose.target[0], boundary.min[0], boundary.max[0]),
    clamp(pose.target[1], boundary.min[1], boundary.max[1]),
    clamp(pose.target[2], boundary.min[2], boundary.max[2]),
  ];
  let dx = pose.position[0] - pose.target[0];
  let dy = pose.position[1] - pose.target[1];
  let dz = pose.position[2] - pose.target[2];
  const distance = Math.hypot(dx, dy, dz);
  // On top of its target the camera has no direction: borrow the default one, keep the distance.
  if (distance < 1e-9) [dx, dy, dz] = PERSPECTIVE_DIRECTION;

  const radius = clamp(distance, limits.minDistance, limits.maxDistance);
  const polar = clamp(
    Math.acos(clamp(dy / Math.hypot(dx, dy, dz), -1, 1)),
    limits.minPolarAngle,
    limits.maxPolarAngle,
  );
  const azimuth = Math.atan2(dx, dz);
  const horizontal = radius * Math.sin(polar);
  const position: Vec3 = [
    target[0] + horizontal * Math.sin(azimuth),
    target[1] + radius * Math.cos(polar),
    target[2] + horizontal * Math.cos(azimuth),
  ];
  const unchanged =
    position.every((value, axis) => Math.abs(value - (pose.position[axis] as number)) < 1e-12) &&
    target.every((value, axis) => value === pose.target[axis]);
  return unchanged ? pose : { position, target };
}

/** Three-quarter pose from which the whole room fits the narrowest axis of the view cone. */
export function fitPerspective(
  bounds: Bounds,
  view: { fov: number; aspect: number },
  margin: number = FIT_MARGIN,
): Pose {
  const center = boundsCenter(bounds);
  const radius = boundsDiagonal(bounds) / 2;
  const halfVertical = (view.fov * Math.PI) / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * Math.max(view.aspect, 1e-3));
  const distance = (radius / Math.sin(Math.min(halfVertical, halfHorizontal))) * margin;
  const length = Math.hypot(...PERSPECTIVE_DIRECTION);
  const position: Vec3 = [
    center[0] + (PERSPECTIVE_DIRECTION[0] / length) * distance,
    center[1] + (PERSPECTIVE_DIRECTION[1] / length) * distance,
    center[2] + (PERSPECTIVE_DIRECTION[2] / length) * distance,
  ];
  return constrainPose({ position, target: center }, orbitLimits(bounds));
}

export interface TopFit {
  readonly pose: Pose;
  /** Orthographic zoom in pixels per metre. */
  readonly zoom: number;
}

/** Plan view: straight down at the centre of the footprint, scaled so that all of it is visible. */
export function fitTop(bounds: Bounds, viewport: Viewport): TopFit {
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[2] - bounds.min[2];
  const zoom =
    viewport.width > 0 && viewport.height > 0
      ? Math.min(viewport.width / (width * TOP_MARGIN), viewport.height / (depth * TOP_MARGIN))
      : FALLBACK_ZOOM;
  return {
    zoom,
    pose: {
      target: [centerX, 0, centerZ],
      position: [centerX, bounds.max[1] + TOP_CLEARANCE, centerZ + TOP_TILT],
    },
  };
}

/** Orthographic zoom (px per metre) that shows the same height at the target as a perspective camera. */
export function equivalentZoom(distance: number, fov: number, viewportHeight: number): number {
  return viewportHeight / (2 * distance * Math.tan((fov * Math.PI) / 360));
}

/** Inverse of {@link equivalentZoom}: the perspective distance that matches an orthographic zoom. */
export function equivalentDistance(zoom: number, fov: number, viewportHeight: number): number {
  return viewportHeight / (2 * zoom * Math.tan((fov * Math.PI) / 360));
}
