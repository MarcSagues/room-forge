import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Vec2, WallId } from '../domain';
import { footprintExtents, footprintInside, type PlacementInput, solvePlacement } from './index';

const ROOM = { width: 4, depth: 3 };
const DESK = { w: 1.2, d: 0.6 };
const deg = (d: number) => (d * Math.PI) / 180;

const input = (overrides: Partial<PlacementInput> = {}): PlacementInput => ({
  room: ROOM,
  size: DESK,
  position: [2, 1.5],
  rotationY: 0,
  ...overrides,
});

describe('solvePlacement: free placement', () => {
  it('keeps a valid position as it is when no snapping applies', () => {
    const result = solvePlacement(input({ position: [2.03, 1.47], rotationY: deg(10) }));
    expect(result).toMatchObject({ valid: true, reason: null, wall: null });
    expect(result.position[0]).toBeCloseTo(2.03);
    expect(result.position[1]).toBeCloseTo(1.47);
    expect(result.rotationY).toBeCloseTo(deg(10));
    expect(result.guides).toEqual([]);
  });

  it('applies grid and angle snapping', () => {
    const result = solvePlacement(
      input({ position: [2.03, 1.47], rotationY: deg(10), gridStep: 0.1, angleStepDeg: 15 }),
    );
    expect(result.position[0]).toBeCloseTo(2);
    expect(result.position[1]).toBeCloseTo(1.5);
    expect(result.rotationY).toBeCloseTo(deg(15));
  });

  it('clamps a footprint that crosses a wall back inside (no wall snap)', () => {
    const result = solvePlacement(input({ position: [-1, 5], wallSnap: false }));
    expect(result.valid).toBe(true);
    expect(result.position[0]).toBeCloseTo(0.6);
    expect(result.position[1]).toBeCloseTo(2.7);
  });

  it('is invalid when the object is larger than the room', () => {
    const result = solvePlacement(input({ size: { w: 5, d: 0.5 }, rotationY: 0 }));
    expect(result).toMatchObject({ valid: false, reason: 'too-large' });
    expect(result.position[0]).toBeCloseTo(2);
  });

  it('reuses the output object (hot path)', () => {
    const out = solvePlacement(input());
    const again = solvePlacement(input({ position: [1, 1] }), out);
    expect(again).toBe(out);
    expect(again.position[0]).toBeCloseTo(1);
  });
});

describe('solvePlacement: wall snap (4 walls × 4 starting orientations)', () => {
  // Back face (z-) must face the wall: north wants 0, south π, west π/2, east -π/2, and the desk
  // ends with its back face on the wall (half its depth, 0.3 m, from the wall plane).
  const expected: Record<WallId, { rotation: number; position: [number, number] }> = {
    north: { rotation: 0, position: [2, 0.3] },
    south: { rotation: Math.PI, position: [2, 2.7] },
    west: { rotation: Math.PI / 2, position: [0.3, 1.5] },
    east: { rotation: -Math.PI / 2, position: [3.7, 1.5] },
  };

  /** A centre whose footprint, at the starting rotation, is 10 cm from `wall` (< 15 cm). */
  function near(wall: WallId, startDeg: number): [number, number] {
    const out: Vec2 = [0, 0];
    footprintExtents(DESK.w, DESK.d, deg(startDeg), out);
    const [ex, ez] = out;
    if (wall === 'north') return [2, ez + 0.1];
    if (wall === 'south') return [2, ROOM.depth - ez - 0.1];
    if (wall === 'west') return [ex + 0.1, 1.5];
    return [ROOM.width - ex - 0.1, 1.5];
  }

  for (const wall of ['north', 'south', 'west', 'east'] as const) {
    for (const start of [0, 90, 180, 270]) {
      it(`${wall} wall, starting at ${start}°`, () => {
        const result = solvePlacement(
          input({ position: near(wall, start), rotationY: deg(start) }),
        );
        expect(result.valid).toBe(true);
        expect(result.wall).toBe(wall);
        expect(Math.cos(result.rotationY - expected[wall].rotation)).toBeCloseTo(1);
        expect(result.position[0]).toBeCloseTo(expected[wall].position[0]);
        expect(result.position[1]).toBeCloseTo(expected[wall].position[1]);
        expect(result.guides).toContainEqual(expect.objectContaining({ kind: 'wall', wall }));
      });
    }
  }

  it('does not snap beyond 15 cm or when disabled', () => {
    expect(solvePlacement(input({ position: [2, 0.6] })).wall).toBeNull(); // 30 cm away
    expect(solvePlacement(input({ position: [2, 0.4], wallSnap: false })).wall).toBeNull();
  });

  it('keeps the position along the wall', () => {
    const result = solvePlacement(input({ position: [0.8, 0.35] }));
    expect(result.wall).toBe('north');
    expect(result.position[0]).toBeCloseTo(0.8);
    expect(result.position[1]).toBeCloseTo(0.3);
  });

  it('in a corner snaps to the nearest wall and clamps along it', () => {
    // 10 cm past the west wall, 5 cm from the north one: west wins, then the turned desk
    // (0.6 × 1.2 along z) is pushed out of the north wall.
    const result = solvePlacement(input({ position: [0.5, 0.35] }));
    expect(result.wall).toBe('west');
    expect(result.position[0]).toBeCloseTo(0.3);
    expect(result.position[1]).toBeCloseTo(0.6);
  });

  it('skips the wall snap when the turned object would not fit', () => {
    // A 2.8 m bench fits along x in a 4 × 2.2 room, but not turned to face the west wall.
    const result = solvePlacement(
      input({ room: { width: 4, depth: 2.2 }, size: { w: 2.8, d: 0.4 }, position: [1.45, 1.1] }),
    );
    expect(result.valid).toBe(true);
    expect(result.wall).toBeNull();
  });

  it('uses the catalog back face', () => {
    const result = solvePlacement(input({ position: [2, 0.4], backFace: 'z+' }));
    expect(result.wall).toBe('north');
    expect(Math.cos(result.rotationY - Math.PI)).toBeCloseTo(1);
  });
});

describe('solvePlacement properties', () => {
  const placement = fc.record({
    width: fc.double({ min: 2, max: 12, noNaN: true }),
    depth: fc.double({ min: 2, max: 12, noNaN: true }),
    w: fc.double({ min: 0.05, max: 3, noNaN: true }),
    d: fc.double({ min: 0.05, max: 3, noNaN: true }),
    x: fc.double({ min: -20, max: 30, noNaN: true }),
    z: fc.double({ min: -20, max: 30, noNaN: true }),
    rotation: fc.double({ min: -10, max: 10, noNaN: true }),
    gridStep: fc.option(fc.constantFrom(0.05, 0.1, 0.25, 0.5), { nil: undefined }),
    angleStepDeg: fc.option(fc.constantFrom(15, 45, 90), { nil: undefined }),
    wallSnap: fc.boolean(),
  });

  it('never leaves a valid footprint outside the room', () => {
    fc.assert(
      fc.property(placement, (p) => {
        const room = { width: p.width, depth: p.depth };
        const result = solvePlacement({
          room,
          size: { w: p.w, d: p.d },
          position: [p.x, p.z],
          rotationY: p.rotation,
          wallSnap: p.wallSnap,
          ...(p.gridStep === undefined ? {} : { gridStep: p.gridStep }),
          ...(p.angleStepDeg === undefined ? {} : { angleStepDeg: p.angleStepDeg }),
        });
        if (result.valid) {
          expect(
            footprintInside(
              room,
              result.position[0],
              result.position[1],
              p.w,
              p.d,
              result.rotationY,
            ),
          ).toBe(true);
        } else {
          expect(result.reason).toBe('too-large');
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('is stable: solving its own result again changes nothing', () => {
    fc.assert(
      fc.property(placement, (p) => {
        const base = {
          room: { width: p.width, depth: p.depth },
          size: { w: p.w, d: p.d },
          wallSnap: p.wallSnap,
          ...(p.gridStep === undefined ? {} : { gridStep: p.gridStep }),
          ...(p.angleStepDeg === undefined ? {} : { angleStepDeg: p.angleStepDeg }),
        };
        const first = solvePlacement({ ...base, position: [p.x, p.z], rotationY: p.rotation });
        if (!first.valid) return;
        const second = solvePlacement({
          ...base,
          position: [first.position[0], first.position[1]],
          rotationY: first.rotationY,
        });
        expect(second.position[0]).toBeCloseTo(first.position[0], 6);
        expect(second.position[1]).toBeCloseTo(first.position[1], 6);
        expect(Math.cos(second.rotationY - first.rotationY)).toBeCloseTo(1, 6);
      }),
      { numRuns: 1000 },
    );
  });
});
