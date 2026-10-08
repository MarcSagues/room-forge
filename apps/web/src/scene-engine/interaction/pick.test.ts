import type { ObjectId } from '@roomforge/core';
import { Euler, Matrix4, Quaternion, Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type PickProxy, pickEntity } from './pick';

const placed = (
  id: string,
  position: [number, number, number],
  options: { rotationY?: number; scale?: [number, number, number]; size?: PickProxy['size'] } = {},
): PickProxy => ({
  id: id as ObjectId,
  size: options.size ?? { w: 1, h: 1, d: 1 },
  matrixWorld: new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(0, options.rotationY ?? 0, 0)),
    new Vector3(...(options.scale ?? [1, 1, 1])),
  ),
});

/** A ray from `from` looking at `to`. */
const rayTo = (from: [number, number, number], to: [number, number, number]) => {
  const origin = new Vector3(...from);
  return new Ray(origin, new Vector3(...to).sub(origin).normalize());
};

describe('pickEntity', () => {
  it('returns the box a ray goes through', () => {
    const hit = pickEntity(rayTo([0, 0.5, 5], [0, 0.5, 0]), [placed('a', [0, 0, 0])]);
    expect(hit?.id).toBe('a');
    expect(hit?.distance).toBeCloseTo(4.5);
  });

  it('returns null when the ray misses every box or points away', () => {
    const proxies = [placed('a', [0, 0, 0])];
    expect(pickEntity(rayTo([3, 0.5, 5], [3, 0.5, 0]), proxies)).toBeNull();
    expect(pickEntity(rayTo([0, 0.5, 5], [0, 0.5, 10]), proxies)).toBeNull();
    expect(pickEntity(rayTo([0, 0.5, 5], [0, 0.5, 0]), [])).toBeNull();
  });

  it('picks the nearest of several boxes along the ray', () => {
    const proxies = [
      placed('far', [0, 0, -3]),
      placed('near', [0, 0, 1]),
      placed('mid', [0, 0, -1]),
    ];
    expect(pickEntity(rayTo([0, 0.5, 5], [0, 0.5, 0]), proxies)?.id).toBe('near');
  });

  it('boxes sit on the floor: a ray under the origin misses', () => {
    const proxies = [placed('a', [0, 0, 0])];
    expect(pickEntity(rayTo([0, -0.2, 5], [0, -0.2, 0]), proxies)).toBeNull();
    expect(pickEntity(rayTo([0, 0.9, 5], [0, 0.9, 0]), proxies)?.id).toBe('a');
  });

  it('follows rotation and scale (oriented boxes)', () => {
    // A 2 m × 0.2 m bench turned 90°: long along z, thin along x.
    const bench = placed('bench', [0, 0, 0], {
      size: { w: 2, h: 0.5, d: 0.2 },
      rotationY: Math.PI / 2,
    });
    expect(pickEntity(rayTo([0.5, 0.25, 5], [0.5, 0.25, 0]), [bench])).toBeNull();
    expect(pickEntity(rayTo([5, 0.25, 0.8], [0, 0.25, 0.8]), [bench])?.id).toBe('bench');

    const tall = placed('tall', [0, 0, 0], { scale: [1, 3, 1] });
    expect(pickEntity(rayTo([0, 2.5, 5], [0, 2.5, 0]), [tall])?.id).toBe('tall');
  });

  it('works for rays straight down (plan view)', () => {
    const hit = pickEntity(rayTo([0.2, 10, 0.2], [0.2, 0, 0.2]), [placed('a', [0, 0, 0])]);
    expect(hit?.distance).toBeCloseTo(9);
  });

  it('costs well under 0.5 ms per pick with 100 objects', () => {
    const proxies = Array.from({ length: 100 }, (_, i) =>
      placed(`o${i}`, [(i % 10) * 1.2, 0, Math.floor(i / 10) * 1.2], { rotationY: i * 0.3 }),
    );
    const ray = rayTo([5, 8, 15], [5, 0, 5]);
    for (let i = 0; i < 200; i += 1) pickEntity(ray, proxies); // warm-up
    const runs = 2000;
    const start = performance.now();
    for (let i = 0; i < runs; i += 1) pickEntity(ray, proxies);
    const perPick = (performance.now() - start) / runs;
    expect(perPick).toBeLessThan(0.5);
  });
});
