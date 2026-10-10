import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { HexColor, ObjectId, Vec3 } from '../domain';
import {
  ALLOCATION_HYSTERESIS,
  type AllocatorView,
  allocateLights,
  emptyAllocation,
  LIGHT_POOL_SIZES,
  type LightAllocation,
  type LightPoolSize,
  luminaireImportance,
} from './allocator';
import type { Luminaire } from './luminaires';

const at = (id: string, position: Vec3, overrides: Partial<Luminaire> = {}): Luminaire => ({
  id: id as ObjectId,
  type: 'point',
  cost: 1,
  on: true,
  color: '#ffffff' as HexColor,
  intensity: 1,
  position,
  head: [position[0], position[1] + 0.1, position[2]],
  yaw: 0,
  selected: false,
  ...overrides,
});

/** A camera at the origin, 1.6 m up, looking along +z. */
const VIEW: AllocatorView = { position: [0, 1.6, 0], direction: [0, 0, 1] };
const MEDIUM = LIGHT_POOL_SIZES.medium;

const assigned = (allocation: LightAllocation) =>
  [...allocation.point, ...allocation.spot].filter((id): id is ObjectId => id !== null);

describe('LIGHT_POOL_SIZES', () => {
  it('follows the P2-11 recommendation', () => {
    expect(LIGHT_POOL_SIZES).toEqual({
      low: { point: 4, spot: 0 },
      medium: { point: 8, spot: 2 },
      high: { point: 12, spot: 4 },
    });
  });
});

describe('luminaireImportance', () => {
  it('prefers the nearer, the brighter, the one in view and the selected one', () => {
    const near = at('a', [0, 1.6, 1]);
    expect(luminaireImportance(near, VIEW)).toBeGreaterThan(
      luminaireImportance(at('b', [0, 1.6, 4]), VIEW),
    );
    expect(luminaireImportance(near, VIEW)).toBeGreaterThan(
      luminaireImportance(at('c', [0, 1.6, 1], { intensity: 0.5 }), VIEW),
    );
    expect(luminaireImportance(near, VIEW)).toBeGreaterThan(
      luminaireImportance(at('d', [0, 1.6, -1]), VIEW),
    );
    expect(luminaireImportance(at('e', [0, 1.6, 1], { selected: true }), VIEW)).toBeGreaterThan(
      luminaireImportance(near, VIEW),
    );
    expect(luminaireImportance(near, VIEW)).toBeGreaterThan(
      luminaireImportance(at('f', [0, 1.6, 1], { cost: 2 }), VIEW),
    );
  });

  it('is positive for any luminaire that gives light, even right at the camera', () => {
    expect(luminaireImportance(at('a', [0, 1.6, 0]), VIEW)).toBeGreaterThan(0);
    expect(luminaireImportance(at('b', [0, 1.6, -9]), VIEW)).toBeGreaterThan(0);
  });
});

describe('allocateLights', () => {
  it('gives the eight most important of twenty luminaires the eight point lights', () => {
    const row = Array.from({ length: 20 }, (_, i) =>
      at(`lamp-${String(i).padStart(2, '0')}`, [0, 1.6, 1 + i]),
    );
    const result = allocateLights(row, VIEW, MEDIUM);
    expect(result.point).toEqual(row.slice(0, 8).map((lamp) => lamp.id));
    expect(result.spot).toEqual([null, null]);
  });

  it('leaves out what is off, at zero intensity, or emissive only (cost 0)', () => {
    const result = allocateLights(
      [
        at('off', [0, 1.6, 1], { on: false }),
        at('dark', [0, 1.6, 1], { intensity: 0 }),
        at('glow', [0, 1.6, 1], { cost: 0 }),
        at('lit', [0, 1.6, 3]),
      ],
      VIEW,
      MEDIUM,
    );
    expect(assigned(result)).toEqual(['lit']);
  });

  it('gives spot lights to spot luminaires only, and lets the overflow take point lights', () => {
    const spots = [1, 2, 3].map((z) => at(`spot-${z}`, [0, 1.6, z], { type: 'spot' }));
    const result = allocateLights([...spots, at('strip', [0, 1.6, 5])], VIEW, MEDIUM);
    expect(result.spot).toEqual(['spot-1', 'spot-2']);
    expect(result.point.slice(0, 2)).toEqual(['spot-3', 'strip']);
  });

  it('lights a desk lamp with a point at low quality, which has no spots', () => {
    const result = allocateLights(
      [at('desk-lamp', [0, 1, 1], { type: 'spot' })],
      VIEW,
      LIGHT_POOL_SIZES.low,
    );
    expect(result).toEqual({ point: ['desk-lamp', null, null, null], spot: [] });
  });

  it('keeps a luminaire that has a light when another is only slightly better (hysteresis)', () => {
    const pool = { point: 1, spot: 0 };
    const a = at('a', [-0.5, 1.6, 2]);
    const b = at('b', [0.5, 1.6, 2]);
    const left: AllocatorView = { position: [-0.1, 1.6, 0], direction: [0, 0, 1] };
    const first = allocateLights([a, b], left, pool);
    expect(first.point).toEqual(['a']);
    // The camera drifts a little to the right: b is now slightly more important, a keeps its light...
    const right: AllocatorView = { position: [0.1, 1.6, 0], direction: [0, 0, 1] };
    expect(luminaireImportance(b, right)).toBeGreaterThan(luminaireImportance(a, right));
    expect(allocateLights([a, b], right, pool, first).point).toEqual(['a']);
    // ...where without hysteresis it would have flickered over to b.
    expect(allocateLights([a, b], right, pool).point).toEqual(['b']);
    // A real change of view hands it over.
    const beside: AllocatorView = { position: [2, 1.6, 2], direction: [1, 0, 0] };
    expect(allocateLights([a, b], beside, pool, first).point).toEqual(['b']);
  });

  it('keeps a luminaire in the same slot while it keeps a light', () => {
    const lamps = ['a', 'b', 'c'].map((id, i) => at(id, [0, 1.6, 1 + i]));
    const first = allocateLights(lamps, VIEW, { point: 3, spot: 0 });
    expect(first.point).toEqual(['a', 'b', 'c']);
    const [, ...rest] = lamps;
    const next = allocateLights(
      [...rest, at('d', [0, 1.6, 9])],
      VIEW,
      { point: 3, spot: 0 },
      first,
    );
    expect(next.point).toEqual(['d', 'b', 'c']);
  });

  it('copes with a previous allocation for another pool size (a quality change)', () => {
    const lamps = Array.from({ length: 6 }, (_, i) => at(`l${i}`, [0, 1.6, 1 + i]));
    const high = allocateLights(lamps, VIEW, LIGHT_POOL_SIZES.high);
    const low = allocateLights(lamps, VIEW, LIGHT_POOL_SIZES.low, high);
    expect(low).toEqual({ point: ['l0', 'l1', 'l2', 'l3'], spot: [] });
  });

  it('returns an all-dark allocation with no luminaires', () => {
    expect(allocateLights([], VIEW, MEDIUM)).toEqual(emptyAllocation(MEDIUM));
  });
});

// ── Properties ─────────────────────────────────────────────────

const coordinate = fc.double({ min: -20, max: 20, noNaN: true });
const vec3 = fc.tuple(coordinate, coordinate, coordinate);

const luminaire = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }),
  type: fc.constantFrom('point' as const, 'spot' as const),
  cost: fc.constantFrom(0 as const, 1 as const, 2 as const),
  on: fc.boolean(),
  intensity: fc.double({ min: 0, max: 1, noNaN: true }),
  position: vec3,
  selected: fc.boolean(),
});

const luminaires = fc
  .uniqueArray(luminaire, { selector: (item) => item.id, maxLength: 40 })
  .map((list) => list.map(({ id, position, ...rest }) => at(id, position, rest)));

const view = fc.record({ position: vec3, direction: vec3 });
const pool: fc.Arbitrary<LightPoolSize> = fc.record({
  point: fc.integer({ min: 0, max: 16 }),
  spot: fc.integer({ min: 0, max: 6 }),
});

describe('allocateLights properties', () => {
  it('never uses more lights than the pool has, nor one luminaire twice, nor one that gives none', () => {
    fc.assert(
      fc.property(luminaires, view, pool, (list, camera, size) => {
        const result = allocateLights(list, camera, size);
        expect(result.point).toHaveLength(size.point);
        expect(result.spot).toHaveLength(size.spot);
        const ids = assigned(result);
        expect(new Set(ids).size).toBe(ids.length);
        const byId = new Map(list.map((item) => [item.id, item]));
        for (const id of ids) {
          const item = byId.get(id);
          expect(item?.on && item.intensity > 0 && item.cost > 0).toBe(true);
        }
        for (const id of result.spot) if (id !== null) expect(byId.get(id)?.type).toBe('spot');
      }),
    );
  });

  it('lights every eligible luminaire when the pool has room for all', () => {
    fc.assert(
      fc.property(luminaires, view, (list, camera) => {
        const lit = list.filter((item) => item.on && item.intensity > 0 && item.cost > 0);
        const result = allocateLights(list, camera, { point: lit.length, spot: 0 });
        expect(new Set(assigned(result))).toEqual(new Set(lit.map((item) => item.id)));
      }),
    );
  });

  it('is deterministic and does not depend on the order of the luminaires', () => {
    fc.assert(
      fc.property(
        luminaires.chain((list) =>
          fc.tuple(fc.constant(list), fc.shuffledSubarray(list, { minLength: list.length })),
        ),
        view,
        pool,
        ([list, shuffled], camera, size) => {
          const result = allocateLights(list, camera, size);
          expect(allocateLights(list, camera, size)).toEqual(result);
          expect(allocateLights(shuffled, camera, size)).toEqual(result);
        },
      ),
    );
  });

  it('is stable: allocating again from its own result changes nothing', () => {
    fc.assert(
      fc.property(luminaires, view, pool, (list, camera, size) => {
        const result = allocateLights(list, camera, size);
        expect(allocateLights(list, camera, size, result)).toEqual(result);
      }),
    );
  });

  it('only hands a light over when the newcomer beats the holder by the hysteresis margin', () => {
    fc.assert(
      fc.property(luminaires, view, view, (list, before, after) => {
        const size = { point: 1, spot: 0 };
        const first = allocateLights(list, before, size);
        const next = allocateLights(list, after, size, first);
        const [holder] = first.point;
        const [winner] = next.point;
        if (holder == null || winner == null || winner === holder) return;
        const byId = new Map(list.map((item) => [item.id, item]));
        const held = byId.get(holder);
        const won = byId.get(winner);
        if (!held || !won) throw new Error('unknown id');
        if (!(held.on && held.intensity > 0 && held.cost > 0)) return;
        expect(luminaireImportance(won, after)).toBeGreaterThanOrEqual(
          luminaireImportance(held, after) * ALLOCATION_HYSTERESIS,
        );
      }),
    );
  });
});
