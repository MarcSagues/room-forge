import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../domain';
import {
  ANGLE_STEPS_DEG,
  backFaceRotation,
  footprintExtents,
  footprintInside,
  GRID_STEPS,
  intersectRayFloor,
  normalizeAngle,
  snapAngle,
  snapToGrid,
} from './index';

const deg = (d: number) => (d * Math.PI) / 180;

describe('snapToGrid', () => {
  it('rounds to the nearest step and avoids -0', () => {
    expect(snapToGrid(0.12, 0.1)).toBeCloseTo(0.1);
    expect(snapToGrid(0.16, 0.1)).toBeCloseTo(0.2);
    expect(snapToGrid(1.37, 0.25)).toBeCloseTo(1.25);
    expect(Object.is(snapToGrid(-0.01, 0.1), 0)).toBe(true);
  });

  it('offers the documented steps', () => {
    expect(GRID_STEPS).toEqual([0.05, 0.1, 0.25, 0.5]);
  });

  it('is idempotent for every step (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.constantFrom(...GRID_STEPS),
        (value, step) => {
          const once = snapToGrid(value, step);
          expect(snapToGrid(once, step)).toBe(once);
          expect(Math.abs(once - value)).toBeLessThanOrEqual(step / 2 + 1e-9);
        },
      ),
    );
  });
});

describe('angles', () => {
  it('normalizes into (-π, π]', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(deg(270))).toBeCloseTo(deg(-90));
  });

  it('snaps to 15°, 45° or 90°', () => {
    expect(ANGLE_STEPS_DEG).toEqual([15, 45, 90]);
    expect(snapAngle(deg(22), 15)).toBeCloseTo(deg(15));
    expect(snapAngle(deg(23), 15)).toBeCloseTo(deg(30));
    expect(snapAngle(deg(100), 90)).toBeCloseTo(deg(90));
    expect(snapAngle(deg(-170), 45)).toBeCloseTo(deg(180));
  });

  it('angle snap is idempotent (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -20, max: 20, noNaN: true }),
        fc.constantFrom(...ANGLE_STEPS_DEG),
        (angle, step) => {
          const once = snapAngle(angle, step);
          expect(snapAngle(once, step)).toBe(once);
        },
      ),
    );
  });
});

describe('footprint', () => {
  it('gives axis-aligned half extents of the rotated rectangle', () => {
    const out: Vec2 = [0, 0];
    footprintExtents(1.2, 0.6, 0, out);
    expect(out[0]).toBeCloseTo(0.6);
    expect(out[1]).toBeCloseTo(0.3);
    footprintExtents(1.2, 0.6, Math.PI / 2, out);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(0.6);
    footprintExtents(1, 1, Math.PI / 4, out);
    expect(out[0]).toBeCloseTo(Math.SQRT1_2);
  });

  it('checks containment with a 1 mm tolerance', () => {
    const room = { width: 4, depth: 3 };
    expect(footprintInside(room, 0.6, 1.5, 1.2, 0.6, 0)).toBe(true);
    expect(footprintInside(room, 0.5995, 1.5, 1.2, 0.6, 0)).toBe(true);
    expect(footprintInside(room, 0.598, 1.5, 1.2, 0.6, 0)).toBe(false);
  });
});

describe('backFaceRotation', () => {
  it('turns a local direction onto a world direction', () => {
    // Back face -z must point to -z (north wall): no turn.
    expect(backFaceRotation('z-', [0, -1])).toBeCloseTo(0);
    // Back face -z must point to +z (south wall): half turn.
    expect(Math.abs(backFaceRotation('z-', [0, 1]))).toBeCloseTo(Math.PI);
    // Back face -z to +x (east wall) and -x (west wall).
    expect(backFaceRotation('z-', [1, 0])).toBeCloseTo(-Math.PI / 2);
    expect(backFaceRotation('z-', [-1, 0])).toBeCloseTo(Math.PI / 2);
    expect(backFaceRotation('x+', [1, 0])).toBeCloseTo(0);
  });
});

describe('intersectRayFloor', () => {
  it('hits the horizontal plane in front of the ray', () => {
    const out: Vec2 = [0, 0];
    expect(intersectRayFloor([0, 5, 0], [0.6, -0.8, 0], 0, out)).toBe(true);
    expect(out[0]).toBeCloseTo(3.75);
    expect(out[1]).toBeCloseTo(0);
    expect(intersectRayFloor([1, 2, 1], [0, -1, 0], 0.75, out)).toBe(true);
    expect(out).toEqual([1, 1]);
  });

  it('misses parallel rays and planes behind the origin', () => {
    const out: Vec2 = [9, 9];
    expect(intersectRayFloor([0, 5, 0], [1, 0, 0], 0, out)).toBe(false);
    expect(intersectRayFloor([0, 5, 0], [0, 1, 0], 0, out)).toBe(false);
    expect(out).toEqual([9, 9]);
  });
});
