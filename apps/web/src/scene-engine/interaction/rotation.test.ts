import { describe, expect, it } from 'vitest';
import {
  FINE_STEP_DEG,
  pointerAngle,
  ROTATE_STEP_DEG,
  type RotationResult,
  rotationByStep,
  solveRotation,
  toDegrees,
} from './rotation';

const fresh = (): RotationResult => ({ position: [0, 0], rotationY: 0, valid: true });
const room = { width: 4, depth: 3 };

describe('rotationByStep', () => {
  it('adds whole steps and wraps into (-π, π]', () => {
    expect(rotationByStep(0, 1, ROTATE_STEP_DEG)).toBeCloseTo(Math.PI / 12);
    expect(rotationByStep(0, -1, ROTATE_STEP_DEG)).toBeCloseTo(-Math.PI / 12);
    expect(rotationByStep(Math.PI - 0.01, 1, ROTATE_STEP_DEG)).toBeLessThan(0);
  });

  it('24 presses of 15° return to the starting orientation', () => {
    for (const start of [0, 0.3, -2.1, Math.PI]) {
      let angle = start;
      for (let i = 0; i < 24; i += 1) angle = rotationByStep(angle, 1, ROTATE_STEP_DEG);
      expect(Math.cos(angle - start)).toBeCloseTo(1, 9);
      expect(Math.sin(angle - start)).toBeCloseTo(0, 9);
    }
  });

  it('the fine step is one degree', () => {
    expect(FINE_STEP_DEG).toBe(1);
    expect(toDegrees(rotationByStep(0, 1, FINE_STEP_DEG))).toBeCloseTo(1);
  });
});

describe('pointerAngle', () => {
  it('measures from +z towards +x, like a three.js rotation about Y', () => {
    expect(pointerAngle(0, 1)).toBeCloseTo(0);
    expect(pointerAngle(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(pointerAngle(0, -1)).toBeCloseTo(Math.PI);
    expect(pointerAngle(-1, 0)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('toDegrees', () => {
  it('reads 0–360, rounded to a tenth of a degree', () => {
    expect(toDegrees(0)).toBe(0);
    expect(toDegrees(Math.PI / 2)).toBe(90);
    expect(toDegrees(-Math.PI / 2)).toBe(270);
    expect(toDegrees(Math.PI)).toBe(180);
    expect(toDegrees(-0.0001)).toBe(0);
  });
});

describe('solveRotation', () => {
  it('keeps the position when the turned footprint still fits', () => {
    const out = solveRotation(
      { room, size: { w: 1.2, d: 0.6 }, position: [2, 1.5], rotationY: Math.PI / 2 },
      fresh(),
    );
    expect(out).toMatchObject({ position: [2, 1.5], valid: true });
    expect(out.rotationY).toBeCloseTo(Math.PI / 2);
  });

  it('pushes the object off a wall it would cross when turned', () => {
    // 1.2 × 0.6 against the south wall (depth 3): turned a quarter it is 1.2 deep.
    const out = solveRotation(
      { room, size: { w: 1.2, d: 0.6 }, position: [2, 2.7], rotationY: Math.PI / 2 },
      fresh(),
    );
    expect(out.valid).toBe(true);
    expect(out.position[1]).toBeCloseTo(3 - 0.6);
    expect(out.position[0]).toBeCloseTo(2);
  });

  it('blocks a turn that cannot fit in the room at all', () => {
    const out = solveRotation(
      {
        room: { width: 4, depth: 1 },
        size: { w: 2, d: 0.6 },
        position: [2, 0.5],
        rotationY: Math.PI / 2,
      },
      fresh(),
    );
    expect(out.valid).toBe(false);
  });

  it("never snaps to a wall or the grid: the turn is the user's", () => {
    const out = solveRotation(
      { room, size: { w: 1.2, d: 0.6 }, position: [1.63, 1.5], rotationY: 0.4 },
      fresh(),
    );
    expect(out.rotationY).toBeCloseTo(0.4);
    expect(out.position[0]).toBeCloseTo(1.63);
  });

  it('reuses the result object', () => {
    const out = fresh();
    expect(
      solveRotation({ room, size: { w: 1, d: 1 }, position: [2, 1.5], rotationY: 0 }, out),
    ).toBe(out);
  });
});
