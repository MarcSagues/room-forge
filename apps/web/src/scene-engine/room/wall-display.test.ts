import { WALL_IDS, type WallId } from '@roomforge/core';
import { describe, expect, it } from 'vitest';
import {
  approach,
  DOWN_WALL_HEIGHT,
  FADED_OPACITY,
  wallFacing,
  wallHeightScale,
  wallTargetOpacity,
} from './wall-display';

/** Horizontal view direction of a camera orbiting the room centre at `azimuthDeg` (0 = south). */
function viewFrom(azimuthDeg: number): [number, number] {
  const a = (azimuthDeg * Math.PI) / 180;
  // Camera on the south side for 0°, east for 90°: it looks back towards the centre.
  return [-Math.sin(a), -Math.cos(a)];
}

const opacities = (azimuthDeg: number) => {
  const [x, z] = viewFrom(azimuthDeg);
  return Object.fromEntries(
    WALL_IDS.map((w) => [w, wallTargetOpacity('cutaway', w, x, z)]),
  ) as Record<WallId, number>;
};

describe('wallFacing', () => {
  it('is 1 for the wall straight between camera and room, -1 for the one behind, 0 sideways', () => {
    const [x, z] = viewFrom(0); // camera south, looking north
    expect(wallFacing('south', x, z)).toBeCloseTo(1);
    expect(wallFacing('north', x, z)).toBeCloseTo(-1);
    expect(wallFacing('east', x, z)).toBeCloseTo(0);
    expect(wallFacing('west', x, z)).toBeCloseTo(0);
  });

  it('ignores the vertical component and is 0 looking straight down', () => {
    expect(wallFacing('south', 0, 0)).toBe(0);
    expect(wallFacing('south', 0, -1e-9)).toBe(0);
  });
});

describe('wallTargetOpacity in cutaway mode (angle table)', () => {
  it.each([
    [0, ['south']],
    [45, ['south', 'east']],
    [90, ['east']],
    [135, ['east', 'north']],
    [180, ['north']],
    [225, ['north', 'west']],
    [270, ['west']],
    [315, ['west', 'south']],
  ] as const)('from %i° fades %j fully and keeps the others', (azimuth, faded) => {
    const result = opacities(azimuth);
    for (const wall of WALL_IDS) {
      if ((faded as readonly WallId[]).includes(wall))
        expect(result[wall]).toBeCloseTo(FADED_OPACITY);
      else expect(result[wall]).toBe(1);
    }
  });

  it('fades one or two front walls from every angle and never a back wall', () => {
    for (let azimuth = 0; azimuth < 360; azimuth += 5) {
      const [x, z] = viewFrom(azimuth);
      const result = opacities(azimuth);
      const fading = WALL_IDS.filter((wall) => result[wall] < 1);
      expect(fading.length, `at ${azimuth}°`).toBeGreaterThanOrEqual(1);
      expect(fading.length, `at ${azimuth}°`).toBeLessThanOrEqual(2);
      for (const wall of WALL_IDS) {
        if (wallFacing(wall, x, z) <= 0) expect(result[wall], `${wall} at ${azimuth}°`).toBe(1);
      }
    }
  });

  it('keeps every wall opaque in the up and down modes and from straight above', () => {
    const [x, z] = viewFrom(0);
    for (const wall of WALL_IDS) {
      expect(wallTargetOpacity('up', wall, x, z)).toBe(1);
      expect(wallTargetOpacity('down', wall, x, z)).toBe(1);
      expect(wallTargetOpacity('cutaway', wall, 0, 0)).toBe(1);
    }
  });
});

describe('wallHeightScale', () => {
  it('cuts walls to the low height only in down mode', () => {
    expect(wallHeightScale('up', 2.6)).toBe(1);
    expect(wallHeightScale('cutaway', 2.6)).toBe(1);
    expect(wallHeightScale('down', 2.6)).toBeCloseTo(DOWN_WALL_HEIGHT / 2.6);
  });
});

describe('approach', () => {
  it('moves towards the target at a constant rate and lands exactly', () => {
    expect(approach(1, 0, 50, 200)).toBeCloseTo(0.75);
    expect(approach(0.1, 0, 50, 200)).toBe(0);
    expect(approach(0, 1, 1000, 200)).toBe(1);
    expect(approach(0.5, 0.5, 16, 200)).toBe(0.5);
  });

  it('jumps at once with a zero duration (reduced motion)', () => {
    expect(approach(1, 0.2, 16, 0)).toBe(0.2);
  });
});
