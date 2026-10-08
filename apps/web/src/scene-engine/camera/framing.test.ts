import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Bounds,
  boundsCenter,
  boundsDiagonal,
  constrainPose,
  equivalentDistance,
  equivalentZoom,
  fitPerspective,
  fitTop,
  MAX_DISTANCE_FACTOR,
  MAX_POLAR_ANGLE,
  orbitLimits,
  overheadPose,
  type Pose,
  sceneBounds,
  type Vec3,
} from './framing';

const room = (width: number, depth: number, height: number, origin: [number, number] = [0, 0]) => ({
  origin,
  shape: { kind: 'rect' as const, width, depth },
  height,
});

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const FOV = 50;
const VIEWPORT = { width: 1280, height: 720 };

describe('sceneBounds', () => {
  it('spans a single room from its origin corner', () => {
    expect(sceneBounds([room(4, 5, 2.6, [-2, -2.5])])).toEqual({
      min: [-2, 0, -2.5],
      max: [2, 2.6, 2.5],
    });
  });

  it('unites several rooms', () => {
    const bounds = sceneBounds([room(2, 2, 2.4), room(3, 4, 3, [5, -1])]);
    expect(bounds.min).toEqual([0, 0, -1]);
    expect(bounds.max).toEqual([8, 3, 3]);
  });

  it('falls back to a default room when there are none', () => {
    const bounds = sceneBounds([]);
    expect(boundsDiagonal(bounds)).toBeGreaterThan(0);
    expect(bounds.min[1]).toBe(0);
  });
});

describe('boundsCenter / boundsDiagonal', () => {
  const bounds: Bounds = { min: [0, 0, 0], max: [3, 4, 12] };
  it('are the box midpoint and its 3D diagonal', () => {
    expect(boundsCenter(bounds)).toEqual([1.5, 2, 6]);
    expect(boundsDiagonal(bounds)).toBeCloseTo(13, 10);
  });
});

describe('orbitLimits', () => {
  it('scales the maximum distance with the room (4× the diagonal)', () => {
    const small = sceneBounds([room(2, 2, 2.2)]);
    const large = sceneBounds([room(12, 12, 4)]);
    expect(orbitLimits(small).maxDistance).toBeCloseTo(MAX_DISTANCE_FACTOR * boundsDiagonal(small));
    expect(orbitLimits(large).maxDistance).toBeCloseTo(MAX_DISTANCE_FACTOR * boundsDiagonal(large));
    expect(orbitLimits(large).maxDistance).toBeGreaterThan(orbitLimits(small).maxDistance);
  });

  it('keeps the camera above the horizon and the target above the floor', () => {
    const limits = orbitLimits(sceneBounds([room(4, 4, 2.6)]));
    expect(limits.maxPolarAngle).toBeLessThan(Math.PI / 2);
    expect(limits.boundary.min[1]).toBe(0);
  });
});

describe('constrainPose', () => {
  const limits = orbitLimits(sceneBounds([room(4, 4, 2.6, [-2, -2])]));

  it('leaves a valid pose untouched', () => {
    const pose: Pose = { position: [3, 3, 3], target: [0, 1, 0] };
    expect(constrainPose(pose, limits)).toEqual(pose);
  });

  it('lifts a camera that would go through the floor', () => {
    const pose = constrainPose({ position: [3, -2, 3], target: [0, 0, 0] }, limits);
    expect(pose.position[1]).toBeGreaterThan(0);
  });

  it('pulls back a camera that is too far away', () => {
    const pose = constrainPose({ position: [500, 500, 500], target: [0, 0, 0] }, limits);
    expect(distance(pose.position, pose.target)).toBeCloseTo(limits.maxDistance, 8);
  });

  it('pushes out a camera that is on top of its target', () => {
    const pose = constrainPose({ position: [0, 1, 0], target: [0, 1, 0] }, limits);
    expect(distance(pose.position, pose.target)).toBeCloseTo(limits.minDistance, 8);
  });

  it('keeps the target inside the allowed boundary', () => {
    const pose = constrainPose({ position: [3, 3, 3], target: [400, 50, -400] }, limits);
    expect(pose.target[0]).toBeLessThanOrEqual(limits.boundary.max[0]);
    expect(pose.target[1]).toBeLessThanOrEqual(limits.boundary.max[1]);
    expect(pose.target[2]).toBeGreaterThanOrEqual(limits.boundary.min[2]);
  });

  it('always yields a pose above the floor within the distance range (property)', () => {
    const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
    const vec3 = fc.tuple(coordinate, coordinate, coordinate);
    fc.assert(
      fc.property(vec3, vec3, (position, target) => {
        const pose = constrainPose({ position, target }, limits);
        const d = distance(pose.position, pose.target);
        const polar = Math.acos((pose.position[1] - pose.target[1]) / d);
        expect(pose.position[1]).toBeGreaterThan(0);
        expect(d).toBeGreaterThanOrEqual(limits.minDistance - 1e-9);
        expect(d).toBeLessThanOrEqual(limits.maxDistance + 1e-9);
        expect(polar).toBeLessThanOrEqual(MAX_POLAR_ANGLE + 1e-9);
      }),
    );
  });

  it('is idempotent (property)', () => {
    const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
    const vec3 = fc.tuple(coordinate, coordinate, coordinate);
    fc.assert(
      fc.property(vec3, vec3, (position, target) => {
        const once = constrainPose({ position, target }, limits);
        const twice = constrainPose(once, limits);
        for (let axis = 0; axis < 3; axis += 1) {
          expect(twice.position[axis]).toBeCloseTo(once.position[axis] as number, 8);
          expect(twice.target[axis]).toBeCloseTo(once.target[axis] as number, 8);
        }
      }),
    );
  });
});

describe('fitPerspective', () => {
  /** The bounding sphere is inside the view cone (angle from the axis ≤ half the narrowest FOV). */
  const sphereIsVisible = (bounds: Bounds, pose: Pose, fov: number, aspect: number) => {
    const radius = boundsDiagonal(bounds) / 2;
    const d = distance(pose.position, pose.target);
    const halfVertical = (fov * Math.PI) / 360;
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
    return Math.asin(radius / d) <= Math.min(halfVertical, halfHorizontal);
  };

  it.each([
    ['2×2 m', room(2, 2, 2.2)],
    ['12×12 m', room(12, 12, 4)],
    ['4×4.5 m', room(4, 4.5, 2.6)],
  ])('frames a %s room completely on landscape and portrait viewports', (_name, r) => {
    const bounds = sceneBounds([r]);
    for (const aspect of [16 / 9, 1, 9 / 16]) {
      const pose = fitPerspective(bounds, { fov: FOV, aspect });
      expect(sphereIsVisible(bounds, pose, FOV, aspect)).toBe(true);
      expect(distance(pose.position, pose.target)).toBeLessThanOrEqual(
        orbitLimits(bounds).maxDistance,
      );
    }
  });

  it('looks at the centre of the room from above the floor', () => {
    const bounds = sceneBounds([room(4, 4.5, 2.6, [-2, -2.25])]);
    const pose = fitPerspective(bounds, { fov: FOV, aspect: 1.6 });
    expect(pose.target).toEqual(boundsCenter(bounds));
    expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
  });

  it('stays within the camera limits', () => {
    const bounds = sceneBounds([room(12, 12, 4)]);
    const pose = fitPerspective(bounds, { fov: FOV, aspect: 1.6 });
    expect(constrainPose(pose, orbitLimits(bounds))).toEqual(pose);
  });
});

describe('fitTop', () => {
  it.each([
    ['2×2 m', room(2, 2, 2.2)],
    ['12×12 m', room(12, 12, 4)],
  ])('fits the whole footprint of a %s room in the viewport', (_name, r) => {
    const bounds = sceneBounds([r]);
    const { zoom } = fitTop(bounds, VIEWPORT);
    const widthPx = (bounds.max[0] - bounds.min[0]) * zoom;
    const depthPx = (bounds.max[2] - bounds.min[2]) * zoom;
    expect(widthPx).toBeLessThan(VIEWPORT.width);
    expect(depthPx).toBeLessThan(VIEWPORT.height);
    expect(Math.max(widthPx / VIEWPORT.width, depthPx / VIEWPORT.height)).toBeGreaterThan(0.7);
  });

  it('uses the narrowest viewport axis', () => {
    const bounds = sceneBounds([room(6, 6, 2.6)]);
    const wide = fitTop(bounds, { width: 1600, height: 600 }).zoom;
    const tall = fitTop(bounds, { width: 600, height: 1600 }).zoom;
    expect(wide).toBeCloseTo(tall, 10);
  });

  it('looks straight down at the centre with north (−z) at the top of the screen', () => {
    const bounds = sceneBounds([room(4, 4, 2.6, [-2, -2])]);
    const { pose } = fitTop(bounds, VIEWPORT);
    expect(pose.target[0]).toBeCloseTo(0, 10);
    expect(pose.target[2]).toBeCloseTo(0, 10);
    expect(pose.position[1]).toBeGreaterThan(bounds.max[1]);
    // A hair towards +z fixes the azimuth so that screen-up is −z.
    expect(pose.position[2]).toBeGreaterThan(pose.target[2]);
    expect(Math.abs(pose.position[0] - pose.target[0])).toBeLessThan(1e-9);
  });

  it('survives an empty viewport', () => {
    const { zoom } = fitTop(sceneBounds([room(4, 4, 2.6)]), { width: 0, height: 0 });
    expect(Number.isFinite(zoom)).toBe(true);
    expect(zoom).toBeGreaterThan(0);
  });
});

describe('overheadPose', () => {
  it('hovers straight above the target at the distance that matches the ortho zoom', () => {
    const { pose, zoom } = fitTop(sceneBounds([room(6, 4, 2.6)]), VIEWPORT);
    const overhead = overheadPose(pose.target, zoom, FOV, VIEWPORT.height);
    expect(overhead.target).toEqual(pose.target);
    expect(overhead.position[0]).toBeCloseTo(pose.target[0], 10);
    expect(overhead.position[1]).toBeCloseTo(
      equivalentDistance(zoom, FOV, VIEWPORT.height) + pose.target[1],
      6,
    );
    // Same north-up tilt as the plan camera, so the swap between cameras does not spin the view.
    expect(overhead.position[2] - overhead.target[2]).toBeCloseTo(
      pose.position[2] - pose.target[2],
      10,
    );
  });

  it('is not constrained: matching the other camera exactly matters more than the limits', () => {
    const overhead = overheadPose([0, 0, 0], 5000, FOV, VIEWPORT.height);
    expect(overhead.position[1]).toBeLessThan(0.3);
  });
});

describe('perspective ↔ orthographic equivalence (for the seamless cut)', () => {
  it('round-trips zoom and distance', () => {
    const zoom = equivalentZoom(7.5, FOV, VIEWPORT.height);
    expect(equivalentDistance(zoom, FOV, VIEWPORT.height)).toBeCloseTo(7.5, 10);
  });

  it('shows the same height at the target plane', () => {
    const distanceToTarget = 10;
    const zoom = equivalentZoom(distanceToTarget, FOV, VIEWPORT.height);
    const visible = 2 * distanceToTarget * Math.tan((FOV * Math.PI) / 360);
    expect(VIEWPORT.height / zoom).toBeCloseTo(visible, 10);
  });
});
