import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clampElevation, maxElevation } from './elevation';

describe('maxElevation', () => {
  it('is the room height minus the scaled height of the object', () => {
    expect(maxElevation(2.6, 0.75)).toBeCloseTo(1.85);
    expect(maxElevation(2.6, 0.5, 2)).toBeCloseTo(1.6);
  });

  it('is never negative', () => {
    expect(maxElevation(2.2, 3)).toBe(0);
  });
});

describe('clampElevation', () => {
  it('keeps any value between the floor and the limit (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 4, noNaN: true }),
        (value, max) => {
          const clamped = clampElevation(value, max);
          expect(clamped).toBeGreaterThanOrEqual(0);
          expect(clamped).toBeLessThanOrEqual(max);
          expect(clampElevation(clamped, max)).toBe(clamped);
        },
      ),
    );
  });
});
