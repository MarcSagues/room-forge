import { describe, expect, it } from 'vitest';
import { buildGridLines } from './grid-lines';

const lines = (a: Float32Array) => a.length / 6;

describe('buildGridLines', () => {
  it('draws a line every 10 cm in both directions, 1 m lines emphasised', () => {
    const grid = buildGridLines(4, 4.5);
    // x: 0..4 → 41 lines (5 major); z: 0..4.5 → 46 lines (0,1,2,3,4 + the 4.5 boundary = 6 major)
    expect(lines(grid.minor) + lines(grid.major)).toBe(41 + 46);
    expect(lines(grid.major)).toBe(5 + 6);
  });

  it('always includes the room boundary as major lines, even for odd sizes', () => {
    const grid = buildGridLines(2.35, 3.05);
    const xs = new Set<number>();
    for (let i = 0; i < grid.major.length; i += 6)
      xs.add(Math.round((grid.major[i] as number) * 1000) / 1000);
    expect(xs.has(0)).toBe(true);
    expect(xs.has(2.35)).toBe(true);
  });

  it('keeps the grid inside the interior and flat on the floor', () => {
    const grid = buildGridLines(3, 2);
    for (const array of [grid.minor, grid.major]) {
      for (let i = 0; i < array.length; i += 3) {
        expect(array[i] as number).toBeGreaterThanOrEqual(0);
        expect(array[i] as number).toBeLessThanOrEqual(3 + 1e-6);
        expect(array[i + 1]).toBe(0);
        expect(array[i + 2] as number).toBeGreaterThanOrEqual(0);
        expect(array[i + 2] as number).toBeLessThanOrEqual(2 + 1e-6);
      }
    }
  });

  it('scales to the largest room without surprises', () => {
    const grid = buildGridLines(12, 12);
    expect(lines(grid.minor) + lines(grid.major)).toBe(121 * 2);
  });
});
