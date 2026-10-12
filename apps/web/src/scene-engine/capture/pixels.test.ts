import { describe, expect, it } from 'vitest';
import { toImageRows } from './pixels';

const pixel = (r: number, g: number, b: number, a: number) => [r, g, b, a];

describe('toImageRows', () => {
  it('puts the rows top first', () => {
    // 1 × 3, bottom row first as WebGL reads it.
    const pixels = new Uint8Array([
      ...pixel(1, 1, 1, 255),
      ...pixel(2, 2, 2, 255),
      ...pixel(3, 3, 3, 255),
    ]);
    toImageRows(pixels, 1, 3);
    expect([...pixels]).toEqual([
      ...pixel(3, 3, 3, 255),
      ...pixel(2, 2, 2, 255),
      ...pixel(1, 1, 1, 255),
    ]);
  });

  it('flips wider images row by row', () => {
    const pixels = new Uint8Array(
      [...pixel(1, 0, 0, 255), ...pixel(2, 0, 0, 255)].concat([
        ...pixel(3, 0, 0, 255),
        ...pixel(4, 0, 0, 255),
      ]),
    );
    toImageRows(pixels, 2, 2);
    expect([pixels[0], pixels[4], pixels[8], pixels[12]]).toEqual([3, 4, 1, 2]);
  });

  it('un-premultiplies translucent pixels and leaves opaque and empty ones alone', () => {
    const pixels = new Uint8Array([
      ...pixel(100, 50, 0, 128),
      ...pixel(10, 20, 30, 255),
      ...pixel(0, 0, 0, 0),
    ]);
    toImageRows(pixels, 3, 1);
    expect([...pixels]).toEqual([
      ...pixel(199, 100, 0, 128),
      ...pixel(10, 20, 30, 255),
      ...pixel(0, 0, 0, 0),
    ]);
  });

  it('never overflows a channel', () => {
    const pixels = new Uint8Array(pixel(200, 0, 0, 100));
    toImageRows(pixels, 1, 1);
    expect(pixels[0]).toBe(255);
  });
});
