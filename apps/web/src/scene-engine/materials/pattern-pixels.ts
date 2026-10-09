import type { MaterialPattern } from '@roomforge/core';

/**
 * The pictures of the material patterns, drawn in code (no image files to download, and nothing for
 * a licence to cover). Each one is a grey square that tiles seamlessly and covers one metre: the
 * material's colour multiplies it, so the pattern only darkens (wood grain, plank seams, grout) and
 * a tint recolours it without touching the pixels. Pure and deterministic: the same call always
 * gives the same bytes, which makes them testable without a GPU.
 */

const TAU = Math.PI * 2;
const MIN_TONE = 0.25;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const fract = (value: number) => value - Math.floor(value);
const mod = (value: number, period: number) => ((value % period) + period) % period;

/** An integer hash to [0, 1): the source of every bit of randomness here. */
function hash(a: number, b: number, seed: number): number {
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Smooth random values on a lattice of `px × py` cells that wraps around, so it tiles. */
function noise(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const ix0 = mod(x0, px);
  const iy0 = mod(y0, py);
  const ix1 = mod(x0 + 1, px);
  const iy1 = mod(y0 + 1, py);
  return lerp(
    lerp(hash(ix0, iy0, seed), hash(ix1, iy0, seed), fx),
    lerp(hash(ix0, iy1, seed), hash(ix1, iy1, seed), fx),
    fy,
  );
}

/** Three layers of `noise`, each twice as fine and half as strong; still in [0, 1] and tileable. */
function fbm(u: number, v: number, px: number, py: number, seed: number): number {
  return (
    (noise(u, v, px, py, seed) * 4 +
      noise(u, v, px * 2, py * 2, seed + 1) * 2 +
      noise(u, v, px * 4, py * 4, seed + 2)) /
    7
  );
}

/** How light the pattern is at (u, v), both in [0, 1): 1 is the colour of the material as it is. */
function tone(pattern: MaterialPattern, u: number, v: number): number {
  switch (pattern) {
    case 'wood-grain': {
      // Rings flowing along the board, bent by slow noise, with a fine grain on top.
      const rings = 0.5 + 0.5 * Math.sin(TAU * (v * 5 + fbm(u, v, 3, 8, 1) * 2.5));
      return 0.8 + 0.14 * rings - 0.08 * noise(u, v, 24, 96, 2);
    }
    case 'planks': {
      // Six boards across the metre, each cut in two with its own offset, a seam all round.
      const board = Math.floor(v * 6);
      const across = fract(v * 6);
      const along = fract(u - hash(board, 0, 3)) * 2;
      const piece = Math.floor(along);
      const seam = across < 0.1 || fract(along) < 0.03;
      const wood = 0.86 + 0.12 * hash(board, piece, 4) - 0.07 * noise(u, v, 8, 60, 5);
      return seam ? wood * 0.55 : wood;
    }
    case 'concrete':
      return 0.8 + 0.14 * fbm(u, v, 4, 4, 6) - 0.06 * noise(u, v, 64, 64, 7);
    case 'slats': {
      // Eight slats side by side, a dark gap at the edge of each.
      const slat = Math.floor(u * 8);
      const gap = fract(u * 8) < 0.09;
      const wood = 0.82 + 0.16 * hash(slat, 0, 8) - 0.05 * noise(u, v, 16, 2, 9);
      return gap ? wood * 0.4 : wood;
    }
    case 'weave': {
      // Sixteen threads each way, over and under: each is lit across its width.
      const over = (Math.floor(u * 16) + Math.floor(v * 16)) % 2 === 0;
      const across = over ? fract(u * 16) : fract(v * 16);
      return 0.62 + 0.36 * (0.5 + 0.5 * Math.sin(Math.PI * across));
    }
    case 'tiles': {
      // Two by two tiles, each a little different, with grout between them.
      const lu = fract(u * 2);
      const lv = fract(v * 2);
      const grout = lu < 0.05 || lu > 0.95 || lv < 0.05 || lv > 0.95;
      const glaze =
        0.9 +
        0.08 * hash(Math.floor(u * 2), Math.floor(v * 2), 10) -
        0.05 * noise(u, v, 12, 12, 11);
      return grout ? 0.55 : glaze;
    }
  }
}

/**
 * RGBA bytes of a `size × size` picture of `pattern`, one metre across. `size` is a power of two
 * from 8 to 1024, which is what mipmapping wants.
 */
export function patternPixels(pattern: MaterialPattern, size: number): Uint8Array {
  if (!Number.isInteger(size) || size < 8 || size > 1024 || (size & (size - 1)) !== 0) {
    throw new RangeError(`Pattern size must be a power of two from 8 to 1024, got ${size}`);
  }
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const grey = Math.round(
        255 * Math.max(MIN_TONE, clamp01(tone(pattern, (x + 0.5) / size, (y + 0.5) / size))),
      );
      const at = (y * size + x) * 4;
      pixels[at] = grey;
      pixels[at + 1] = grey;
      pixels[at + 2] = grey;
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}
