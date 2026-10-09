import { describe, expect, it } from 'vitest';
import { type GuidePose, wallGuidePose } from './wall-guide';

const pose = (): GuidePose => ({ x: 0, z: 0, length: 0, rotationY: 0 });

/** Where the guide's unit segment (local +x, 0..1) ends up in the world, on the floor plane. */
function ends({ x, z, length, rotationY }: GuidePose) {
  const dx = Math.cos(rotationY) * length;
  const dz = -Math.sin(rotationY) * length;
  return { from: [x, z], to: [x + dx, z + dz] };
}

describe('wallGuidePose', () => {
  // A 4 × 3 m room whose corner is at world (-2, -1).
  const place = (wall: Parameters<typeof wallGuidePose>[0]) =>
    ends(wallGuidePose(wall, 4, 3, -2, -1, pose()));

  it('runs along the north wall, west to east', () => {
    const { from, to } = place('north');
    expect(from).toEqual([-2, -1]);
    expect(to[0]).toBeCloseTo(2);
    expect(to[1]).toBeCloseTo(-1);
  });

  it('runs along the south wall at the far edge', () => {
    const { from, to } = place('south');
    expect(from).toEqual([-2, 2]);
    expect(to[0]).toBeCloseTo(2);
    expect(to[1]).toBeCloseTo(2);
  });

  it('runs along the west wall, north to south', () => {
    const { from, to } = place('west');
    expect(from).toEqual([-2, -1]);
    expect(to[0]).toBeCloseTo(-2);
    expect(to[1]).toBeCloseTo(2);
  });

  it('runs along the east wall at the far edge', () => {
    const { from, to } = place('east');
    expect(from).toEqual([2, -1]);
    expect(to[0]).toBeCloseTo(2);
    expect(to[1]).toBeCloseTo(2);
  });

  it('reuses the object it is given', () => {
    const out = pose();
    expect(wallGuidePose('north', 4, 3, 0, 0, out)).toBe(out);
  });
});
