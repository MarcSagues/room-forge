import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../domain';
import type { SupportSurface } from '../ports';
import {
  footprintExtents,
  GEOMETRY_TOLERANCE,
  intersectRaySupport,
  roomToSupport,
  type SupportFrame,
  solveOnSupport,
  supportToRoom,
} from './index';

const deg = (d: number) => (d * Math.PI) / 180;
/** A 1.4 × 0.7 m desk top, 0.74 m high. */
const TOP: SupportSurface = { y: 0.74, rect: { x: 0, z: 0, w: 1.4, d: 0.7 } };
const MONITOR = { w: 0.61, d: 0.2 };

const frame = (overrides: Partial<SupportFrame> = {}): SupportFrame => ({
  x: 2,
  y: 0,
  z: 1.5,
  rotationY: 0,
  sx: 1,
  sy: 1,
  sz: 1,
  ...overrides,
});

const frameArb = fc.record({
  x: fc.double({ min: -5, max: 5, noNaN: true }),
  y: fc.constant(0),
  z: fc.double({ min: -5, max: 5, noNaN: true }),
  rotationY: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
  sx: fc.double({ min: 0.5, max: 2, noNaN: true }),
  sy: fc.double({ min: 0.5, max: 2, noNaN: true }),
  sz: fc.double({ min: 0.5, max: 2, noNaN: true }),
});
const coord = fc.double({ min: -3, max: 3, noNaN: true });

/** The turned footprint centred at `position` lies inside the support rect (1 mm slack). */
function insideTop(position: Vec2, rotationY: number, size = MONITOR, top = TOP) {
  const [ex, ez] = footprintExtents(size.w, size.d, rotationY, [0, 0]);
  const t = GEOMETRY_TOLERANCE;
  const { rect } = top;
  return (
    position[0] - ex >= rect.x - rect.w / 2 - t &&
    position[0] + ex <= rect.x + rect.w / 2 + t &&
    position[1] - ez >= rect.z - rect.d / 2 - t &&
    position[1] + ez <= rect.z + rect.d / 2 + t
  );
}

describe('supportToRoom / roomToSupport', () => {
  it('turns like three.js: +x of a desk turned 90° points to -z in the room', () => {
    const out: Vec2 = [0, 0];
    supportToRoom(frame({ rotationY: deg(90) }), 0.5, 0, out);
    expect(out[0]).toBeCloseTo(2);
    expect(out[1]).toBeCloseTo(1);
  });

  it('applies the scale of the support before turning it', () => {
    const out: Vec2 = [0, 0];
    supportToRoom(frame({ sx: 2 }), 0.5, 0.25, out);
    expect(out[0]).toBeCloseTo(3);
    expect(out[1]).toBeCloseTo(1.75);
  });

  it('round-trips any point (property)', () => {
    fc.assert(
      fc.property(frameArb, coord, coord, (f, x, z) => {
        const local: Vec2 = [0, 0];
        const back: Vec2 = [0, 0];
        roomToSupport(f, x, z, local);
        supportToRoom(f, local[0], local[1], back);
        expect(back[0]).toBeCloseTo(x, 9);
        expect(back[1]).toBeCloseTo(z, 9);
      }),
    );
  });

  it('keeps the world pose of a child however its support moves (property)', () => {
    // A child stores a local pose; its room pose is the composition with its parent's.
    fc.assert(
      fc.property(
        fc.array(frameArb, { minLength: 1, maxLength: 10 }),
        coord,
        coord,
        (moves, x, z) => {
          const local: Vec2 = [x / 10, z / 10];
          for (const f of moves) {
            const world: Vec2 = [0, 0];
            supportToRoom(f, local[0], local[1], world);
            const again: Vec2 = [0, 0];
            roomToSupport(f, world[0], world[1], again);
            expect(again[0]).toBeCloseTo(local[0], 9);
            expect(again[1]).toBeCloseTo(local[1], 9);
          }
        },
      ),
    );
  });
});

describe('solveOnSupport', () => {
  it('keeps a pose that already fits', () => {
    const result = solveOnSupport({
      support: TOP,
      size: MONITOR,
      position: [0.1, -0.1],
      rotationY: 0,
    });
    expect(result).toMatchObject({ valid: true, reason: null, wall: null });
    expect(result.position).toEqual([0.1, -0.1]);
  });

  it('clamps the footprint inside the top', () => {
    const result = solveOnSupport({ support: TOP, size: MONITOR, position: [2, -1], rotationY: 0 });
    expect(result.valid).toBe(true);
    expect(result.position[0]).toBeCloseTo(0.7 - 0.305);
    expect(result.position[1]).toBeCloseTo(-0.35 + 0.1);
  });

  it('snaps to the grid from the centre of the item and turns by the angle step', () => {
    const result = solveOnSupport({
      support: TOP,
      size: MONITOR,
      position: [0.13, 0.04],
      rotationY: deg(10),
      gridStep: 0.1,
      angleStepDeg: 15,
    });
    expect(result.position[0]).toBeCloseTo(0.1);
    expect(result.position[1]).toBeCloseTo(0);
    expect(result.rotationY).toBeCloseTo(deg(15));
  });

  it('is invalid when the item is larger than the top', () => {
    const result = solveOnSupport({
      support: TOP,
      size: { w: 2, d: 0.2 },
      position: [0, 0],
      rotationY: 0,
    });
    expect(result).toMatchObject({ valid: false, reason: 'too-large' });
  });

  it('always leaves a fitting footprint inside its support, and is stable (property)', () => {
    fc.assert(
      fc.property(
        coord,
        coord,
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.option(fc.constantFrom(0.05, 0.1, 0.25, 0.5), { nil: undefined }),
        fc.option(fc.constantFrom(15, 45, 90), { nil: undefined }),
        (x, z, rotationY, gridStep, angleStepDeg) => {
          const input = { support: TOP, size: MONITOR, position: [x, z] as const, rotationY };
          const result = solveOnSupport({ ...input, gridStep, angleStepDeg });
          expect(result.valid).toBe(true);
          expect(insideTop(result.position, result.rotationY)).toBe(true);
          const again = solveOnSupport({
            ...input,
            position: [result.position[0], result.position[1]],
            rotationY: result.rotationY,
            gridStep,
            angleStepDeg,
          });
          expect(again.position).toEqual(result.position);
          expect(again.rotationY).toBe(result.rotationY);
        },
      ),
    );
  });

  it('reuses the output object (hot path)', () => {
    const out = solveOnSupport({ support: TOP, size: MONITOR, position: [0, 0], rotationY: 0 });
    expect(
      solveOnSupport({ support: TOP, size: MONITOR, position: [0.1, 0], rotationY: 0 }, out),
    ).toBe(out);
  });
});

describe('intersectRaySupport', () => {
  const down = [0, -1, 0] as const;
  const out: Vec2 = [0, 0];

  it('hits the top from above and returns the distance along the ray', () => {
    const t = intersectRaySupport([2.3, 2, 1.4], down, frame(), TOP, out);
    expect(t).toBeCloseTo(2 - 0.74);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(-0.1);
  });

  it('misses beside the top, from below, and along it', () => {
    expect(intersectRaySupport([2.8, 2, 1.5], down, frame(), TOP, out)).toBe(-1);
    expect(intersectRaySupport([2, 0.2, 1.5], [0, 1, 0], frame(), TOP, [0, 0])).toBeCloseTo(0.54);
    expect(intersectRaySupport([2, 0.2, 1.5], [0, -1, 0], frame(), TOP, out)).toBe(-1);
    expect(intersectRaySupport([2, 0.74, 1.5], [1, 0, 0], frame(), TOP, out)).toBe(-1);
  });

  it('follows a turned, raised and scaled support', () => {
    // Turned 90°, the 1.4 m side runs along z; scaled ×2 in height the top is at 1.48 m.
    const turned = frame({ rotationY: deg(90), sy: 2 });
    expect(intersectRaySupport([2, 3, 1.5 - 0.6], down, turned, TOP, out)).toBeCloseTo(3 - 1.48);
    expect(out[0]).toBeCloseTo(0.6);
    expect(intersectRaySupport([2.6, 3, 1.5], down, turned, TOP, out)).toBe(-1);
  });

  it('tests the point less a grab offset, so the grabbed centre is what lands on the top', () => {
    expect(intersectRaySupport([2.8, 2, 1.5], down, frame(), TOP, out, [0.3, 0])).toBeCloseTo(1.26);
    expect(out[0]).toBeCloseTo(0.5);
  });
});
