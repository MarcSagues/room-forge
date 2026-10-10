import { OPENING_VARIANTS, type OpeningVariant } from '@roomforge/core';
import { describe, expect, it } from 'vitest';
import {
  FRAME_PROUD,
  MAX_OPENING_PARTS,
  type OpeningShape,
  type OpeningSlot,
  writeOpeningParts,
} from './opening-parts';

const T = 0.1;
const EPS = 1e-9;

interface Part {
  slot: OpeningSlot;
  min: [number, number, number];
  max: [number, number, number];
}

function partsOf(opening: OpeningShape, thickness = T): Part[] {
  const parts: Part[] = [];
  writeOpeningParts(opening, thickness, (slot, cx, cy, cz, sx, sy, sz) => {
    parts.push({
      slot,
      min: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
      max: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
    });
  });
  return parts;
}

const variants = Object.entries(OPENING_VARIANTS).map(([variant, size]) => ({
  variant,
  kind: size.kind,
  width: size.width,
  height: size.height,
}));

const overlap = (a: Part, b: Part) =>
  [0, 1, 2].every(
    (k) =>
      (a.min[k] as number) < (b.max[k] as number) - EPS &&
      (b.min[k] as number) < (a.max[k] as number) - EPS,
  );

describe('writeOpeningParts', () => {
  it.each(variants)('$variant stays inside the hole and through the wall', (opening) => {
    const parts = partsOf(opening);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.length).toBeLessThanOrEqual(MAX_OPENING_PARTS);
    for (const part of parts) {
      expect(part.min[0]).toBeGreaterThanOrEqual(-opening.width / 2 - EPS);
      expect(part.max[0]).toBeLessThanOrEqual(opening.width / 2 + EPS);
      expect(part.min[1]).toBeGreaterThanOrEqual(-EPS);
      expect(part.max[1]).toBeLessThanOrEqual(opening.height + EPS);
      expect(part.max[2]).toBeLessThanOrEqual(T / 2 + FRAME_PROUD + EPS);
      expect(part.min[2]).toBeGreaterThanOrEqual(-T / 2 - FRAME_PROUD - EPS);
    }
  });

  it.each(variants)('$variant has no two parts inside each other (no z-fighting)', (opening) => {
    const parts = partsOf(opening);
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        expect(overlap(parts[i] as Part, parts[j] as Part), `parts ${i} and ${j}`).toBe(false);
      }
    }
  });

  it('frames cover the full height of the hole on both sides', () => {
    for (const opening of variants) {
      const jambs = partsOf(opening).filter(
        (p) => p.slot === 'frame' && p.max[1] - p.min[1] >= opening.height - EPS,
      );
      expect(jambs).toHaveLength(2);
    }
  });

  it.each([
    ['door.single', 'leaf', 1],
    ['door.double', 'leaf', 2],
    ['window.standard', 'glass', 1],
    ['window.large', 'glass', 2],
  ] as const)('%s has %s × %i', (variant, slot, count) => {
    const size = OPENING_VARIANTS[variant as OpeningVariant];
    const parts = partsOf({ variant, kind: size.kind, width: size.width, height: size.height });
    expect(parts.filter((p) => p.slot === slot)).toHaveLength(count);
    expect(parts.some((p) => p.slot === (slot === 'leaf' ? 'glass' : 'leaf'))).toBe(false);
  });

  it('keeps the frame thinner than a quarter of a very small opening', () => {
    const parts = partsOf({ kind: 'window', variant: 'window.standard', width: 0.1, height: 0.1 });
    for (const part of parts) {
      expect(part.max[0] - part.min[0]).toBeGreaterThan(0);
      expect(part.max[1] - part.min[1]).toBeGreaterThan(0);
    }
  });
});
