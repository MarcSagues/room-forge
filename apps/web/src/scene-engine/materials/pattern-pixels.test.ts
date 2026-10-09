import type { MaterialPattern } from '@roomforge/core';
import { describe, expect, it } from 'vitest';
import { patternPixels } from './pattern-pixels';

const PATTERNS: MaterialPattern[] = ['wood-grain', 'planks', 'concrete', 'slats', 'weave', 'tiles'];
const SIZE = 64;

const gray = (pixels: Uint8Array, x: number, y: number, size = SIZE) =>
  pixels[(y * size + x) * 4] as number;

describe.each(PATTERNS)('patternPixels: %s', (pattern) => {
  const pixels = patternPixels(pattern, SIZE);

  it('is a square RGBA image of the size asked for, fully opaque', () => {
    expect(pixels).toBeInstanceOf(Uint8Array);
    expect(pixels).toHaveLength(SIZE * SIZE * 4);
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
  });

  it('is grey: colour comes from the material, the pattern only darkens', () => {
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i + 1]).toBe(pixels[i]);
      expect(pixels[i + 2]).toBe(pixels[i]);
    }
  });

  it('stays light enough not to turn the material into mud, and is never flat', () => {
    let min = 255;
    let max = 0;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const v = pixels[i] as number;
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
    }
    const mean = sum / (pixels.length / 4);
    expect(min).toBeGreaterThanOrEqual(60);
    expect(max).toBeLessThanOrEqual(255);
    expect(max - min).toBeGreaterThan(20);
    expect(mean).toBeGreaterThan(150);
    expect(mean).toBeLessThan(250);
  });

  it('is the same every time it is made', () => {
    expect(Array.from(patternPixels(pattern, SIZE))).toEqual(Array.from(pixels));
  });

  it('tiles: the edges meet no more abruptly than the biggest step inside the image', () => {
    // Textures repeat every metre, so the last column must lead into the first like any two
    // neighbours do. (Plank seams and grout are steps by design, and they repeat too: the edge may
    // be one of those, but never a bigger jump than the biggest of them.)
    const columnDiff = (a: number, b: number) => {
      let total = 0;
      for (let y = 0; y < SIZE; y += 1) total += Math.abs(gray(pixels, a, y) - gray(pixels, b, y));
      return total / SIZE;
    };
    const rowDiff = (a: number, b: number) => {
      let total = 0;
      for (let x = 0; x < SIZE; x += 1) total += Math.abs(gray(pixels, x, a) - gray(pixels, x, b));
      return total / SIZE;
    };
    let biggestColumnStep = 0;
    let biggestRowStep = 0;
    for (let i = 0; i < SIZE - 1; i += 1) {
      biggestColumnStep = Math.max(biggestColumnStep, columnDiff(i, i + 1));
      biggestRowStep = Math.max(biggestRowStep, rowDiff(i, i + 1));
    }
    expect(columnDiff(SIZE - 1, 0)).toBeLessThanOrEqual(biggestColumnStep + 8);
    expect(rowDiff(SIZE - 1, 0)).toBeLessThanOrEqual(biggestRowStep + 8);
  });

  it('scales with the size: a bigger image is the same picture, finer', () => {
    const big = patternPixels(pattern, SIZE * 2);
    expect(big).toHaveLength(SIZE * SIZE * 4 * 4);
    // The same place of the tile has about the same tone at both sizes.
    let total = 0;
    for (let y = 0; y < SIZE; y += 4) {
      for (let x = 0; x < SIZE; x += 4) {
        total += Math.abs(gray(pixels, x, y) - gray(big, x * 2, y * 2, SIZE * 2));
      }
    }
    expect(total / (SIZE / 4) ** 2).toBeLessThan(40);
  });
});

describe('patternPixels: the patterns differ from each other', () => {
  it('no two patterns are the same image', () => {
    const images = PATTERNS.map((pattern) => Array.from(patternPixels(pattern, SIZE)).join());
    expect(new Set(images).size).toBe(PATTERNS.length);
  });

  it('planks have visible seams: a row of dark pixels along a plank edge', () => {
    const pixels = patternPixels('planks', SIZE);
    let darkRows = 0;
    for (let y = 0; y < SIZE; y += 1) {
      let dark = 0;
      for (let x = 0; x < SIZE; x += 1) if (gray(pixels, x, y) < 150) dark += 1;
      if (dark > SIZE * 0.5) darkRows += 1;
    }
    expect(darkRows).toBeGreaterThanOrEqual(3);
  });

  it('tiles have grout lines in both directions', () => {
    const pixels = patternPixels('tiles', SIZE);
    const mean =
      (pixels.reduce((sum, v, i) => (i % 4 === 0 ? sum + v : sum), 0) * 4) / pixels.length;
    let darkColumns = 0;
    let darkRows = 0;
    for (let i = 0; i < SIZE; i += 1) {
      let column = 0;
      let row = 0;
      for (let j = 0; j < SIZE; j += 1) {
        column += gray(pixels, i, j);
        row += gray(pixels, j, i);
      }
      if (column / SIZE < mean * 0.9) darkColumns += 1;
      if (row / SIZE < mean * 0.9) darkRows += 1;
    }
    expect(darkColumns).toBeGreaterThanOrEqual(1);
    expect(darkRows).toBeGreaterThanOrEqual(1);
  });
});

describe('patternPixels: bad input', () => {
  it('refuses a size that is not a power of two between 8 and 1024 (textures want mipmaps)', () => {
    for (const size of [0, 7, 12, 100, 2048, -64, 1.5, Number.NaN]) {
      expect(() => patternPixels('wood-grain', size)).toThrow(/size/i);
    }
    expect(() => patternPixels('wood-grain', 8)).not.toThrow();
    expect(() => patternPixels('wood-grain', 1024)).not.toThrow();
  });
});
