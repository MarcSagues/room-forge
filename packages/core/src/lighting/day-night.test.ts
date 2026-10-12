import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createLook,
  DAY_NIGHT_TRANSITION_MS,
  easeLevel,
  LIGHTING_LOOKS,
  mixLook,
  modeLevel,
  roomsBounds,
  stepLevel,
  sunDirection,
  sunShadowFrame,
} from './day-night';

describe('modeLevel and stepLevel', () => {
  it('day is 0 and night is 1', () => {
    expect(modeLevel('day')).toBe(0);
    expect(modeLevel('night')).toBe(1);
  });

  it('crosses the whole way in the transition time, linearly, and stops on the target', () => {
    const d = DAY_NIGHT_TRANSITION_MS;
    expect(stepLevel(0, 1, d / 4, d)).toBeCloseTo(0.25, 9);
    expect(stepLevel(0.25, 1, d / 4, d)).toBeCloseTo(0.5, 9);
    expect(stepLevel(0.9, 1, d, d)).toBe(1);
    expect(stepLevel(1, 0, d / 2, d)).toBeCloseTo(0.5, 9);
    expect(stepLevel(0.1, 0, d, d)).toBe(0);
  });

  it('jumps straight to the target with no duration (reduced motion)', () => {
    expect(stepLevel(0, 1, 16, 0)).toBe(1);
    expect(stepLevel(0.4, 0, 0, 0)).toBe(0);
  });

  it('never overshoots and always moves towards the target (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom(0, 1),
        fc.double({ min: 0, max: 2000, noNaN: true }),
        (level, target, elapsed) => {
          const next = stepLevel(level, target, elapsed, DAY_NIGHT_TRANSITION_MS);
          expect(Math.abs(target - next)).toBeLessThanOrEqual(Math.abs(target - level));
          expect(next).toBeGreaterThanOrEqual(0);
          expect(next).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it('eases in and out between fixed ends', () => {
    expect(easeLevel(0)).toBe(0);
    expect(easeLevel(1)).toBe(1);
    expect(easeLevel(0.5)).toBeCloseTo(0.5, 9);
    expect(easeLevel(0.1)).toBeLessThan(0.1);
    expect(easeLevel(0.9)).toBeGreaterThan(0.9);
  });
});

describe('mixLook', () => {
  it('is the day look at 0 and the night look at 1', () => {
    expect(mixLook(0, createLook())).toEqual(LIGHTING_LOOKS.day);
    expect(mixLook(1, createLook())).toEqual(LIGHTING_LOOKS.night);
  });

  it('writes into the object it is given (no allocation per frame)', () => {
    const out = createLook();
    const sky = out.sky;
    expect(mixLook(0.5, out)).toBe(out);
    expect(out.sky).toBe(sky);
  });

  it('stays between the two looks, value by value (property)', () => {
    const { day, night } = LIGHTING_LOOKS;
    const between = (value: number, a: number, b: number) =>
      value >= Math.min(a, b) - 1e-12 && value <= Math.max(a, b) + 1e-12;
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (level) => {
        const look = mixLook(level, createLook());
        expect(between(look.sun, day.sun, night.sun)).toBe(true);
        expect(between(look.hemisphere, day.hemisphere, night.hemisphere)).toBe(true);
        expect(between(look.environment, day.environment, night.environment)).toBe(true);
        look.sky.forEach((channel, i) => {
          expect(between(channel, day.sky[i] as number, night.sky[i] as number)).toBe(true);
        });
      }),
    );
  });

  it('night is darker than day and keeps a faint moon (the same light as the sun)', () => {
    const { day, night } = LIGHTING_LOOKS;
    expect(night.hemisphere).toBeLessThan(day.hemisphere / 4);
    expect(night.environment).toBeLessThan(day.environment / 4);
    expect(night.sun).toBeGreaterThan(0);
    expect(night.sun).toBeLessThan(day.sun / 8);
    // Bluish: more blue than red in the night sky and moonlight.
    expect(night.sky[2]).toBeGreaterThan(night.sky[0]);
    expect(night.sunColor[2]).toBeGreaterThan(night.sunColor[0]);
  });
});

describe('sunDirection', () => {
  it('is a unit vector pointing up at the elevation, turning clockwise from north (-z)', () => {
    const north = sunDirection(0, 60);
    expect(north[1]).toBeCloseTo(Math.sin(Math.PI / 3), 9);
    expect(north[0]).toBeCloseTo(0, 9);
    expect(north[2]).toBeLessThan(0);
    const east = sunDirection(90, 60);
    expect(east[0]).toBeGreaterThan(0);
    expect(east[2]).toBeCloseTo(0, 9);
    for (const azimuth of [0, 45, 135, 200, 360]) {
      expect(Math.hypot(...sunDirection(azimuth))).toBeCloseTo(1, 9);
    }
  });
});

describe('roomsBounds', () => {
  it('covers every room from the floor to its height, plus a margin', () => {
    const bounds = roomsBounds(
      [
        { origin: [0, 0], shape: { width: 4, depth: 3 }, height: 2.5 },
        { origin: [5, -1], shape: { width: 2, depth: 2 }, height: 3 },
      ],
      0.1,
    );
    expect(bounds).toEqual({ min: [-0.1, 0, -1.1], max: [7.1, 3, 3.1] });
  });

  it('is null without rooms', () => {
    expect(roomsBounds([], 0.1)).toBeNull();
  });
});

describe('sunShadowFrame', () => {
  const coordinate = fc.double({ min: -10, max: 10, noNaN: true });
  const size = fc.double({ min: 0.5, max: 12, noNaN: true });

  it('sees every corner of the bounds inside its box (property)', () => {
    fc.assert(
      fc.property(
        coordinate,
        coordinate,
        size,
        size,
        fc.double({ min: 2, max: 4, noNaN: true }),
        fc.double({ min: 0, max: 360, noNaN: true }),
        fc.double({ min: 10, max: 85, noNaN: true }),
        (x, z, w, d, h, azimuth, elevation) => {
          const bounds = { min: [x, 0, z] as const, max: [x + w, h, z + d] as const };
          const direction = sunDirection(azimuth, elevation);
          const frame = sunShadowFrame(bounds, direction);
          // The camera's frame, as three.js builds it with lookAt (up = +y).
          const forward = frame.position.map((p, i) => p - (frame.target[i] as number));
          const zAxis = normalise(forward);
          const xAxis = normalise(cross([0, 1, 0], zAxis));
          const yAxis = cross(zAxis, xAxis);
          for (const cx of [x, x + w]) {
            for (const cy of [0, h]) {
              for (const cz of [z, z + d]) {
                const rel = [cx, cy, cz].map((c, i) => c - (frame.position[i] as number));
                const u = dot(rel, xAxis);
                const v = dot(rel, yAxis);
                const depth = -dot(rel, zAxis);
                expect(u).toBeGreaterThanOrEqual(frame.left);
                expect(u).toBeLessThanOrEqual(frame.right);
                expect(v).toBeGreaterThanOrEqual(frame.bottom);
                expect(v).toBeLessThanOrEqual(frame.top);
                expect(depth).toBeGreaterThan(frame.near);
                expect(depth).toBeLessThan(frame.far);
              }
            }
          }
        },
      ),
    );
  });

  it('places the light on the side of the sun, aimed at the centre of the bounds', () => {
    const frame = sunShadowFrame({ min: [0, 0, 0], max: [4, 2.5, 4] }, sunDirection(90, 60));
    expect(frame.target).toEqual([2, 1.25, 2]);
    expect(frame.position[0]).toBeGreaterThan(2); // east of the centre
    expect(frame.position[2]).toBeCloseTo(2, 9);
    expect(frame.position[1]).toBeGreaterThan(2.5);
  });
});

function normalise(v: readonly number[]): number[] {
  const length = Math.hypot(...v);
  return v.map((c) => c / length);
}

function cross(a: readonly number[], b: readonly number[]): number[] {
  const [ax = 0, ay = 0, az = 0] = a;
  const [bx = 0, by = 0, bz = 0] = b;
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, c, i) => sum + c * (b[i] as number), 0);
}
