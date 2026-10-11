import type { LightAllocation, LightPoolSize, Luminaire, ObjectId } from '@roomforge/core';
import { Group, PointLight, SpotLight } from 'three';

/** Candela of a luminaire at full intensity (physically based lights, three ≥ r155). */
export const POINT_INTENSITY = 2.5;
export const SPOT_INTENSITY = 8;
/** How far a pool light reaches, in metres: past it, it shades nothing. */
const POINT_RANGE = 4;
const SPOT_RANGE = 5;
const SPOT_ANGLE = 0.7;
const SPOT_PENUMBRA = 0.4;
/** A desk lamp shines down and a little to its front. */
const SPOT_REACH_FORWARD = 0.35;

export const LIGHT_POOL_NAME = 'light-pool';

/**
 * The fixed set of three.js lights the luminaires borrow (ADR-0006, P2-11). Made once per quality
 * level and never changed in number, type or shadows afterwards, so no shader recompiles: a light
 * nobody uses is dark (`intensity = 0`), never hidden or removed.
 */
export interface LightPool {
  /** Holds every light and spot target; add it to the scene once. */
  readonly group: Group;
  readonly points: readonly PointLight[];
  readonly spots: readonly SpotLight[];
  dispose(): void;
}

export function createLightPool(size: LightPoolSize): LightPool {
  const group = new Group();
  group.name = LIGHT_POOL_NAME;
  const points = Array.from({ length: size.point }, () => {
    const light = new PointLight('#ffffff', 0, POINT_RANGE, 2);
    light.castShadow = false;
    group.add(light);
    return light;
  });
  const spots = Array.from({ length: size.spot }, () => {
    const light = new SpotLight('#ffffff', 0, SPOT_RANGE, SPOT_ANGLE, SPOT_PENUMBRA, 2);
    light.castShadow = false;
    group.add(light, light.target);
    return light;
  });
  return {
    group,
    points,
    spots,
    // Lights hold no GPU memory without shadows; this frees anything three made for them. The
    // lights stay usable (React Strict Mode disposes once and keeps the pool).
    dispose() {
      for (const light of [...points, ...spots]) light.dispose();
    },
  };
}

/**
 * Gives every pool light the luminaire the allocation chose for it (colour, brightness, place), or
 * darkens it. A spot lamp that only got a point light shines from its centre like the others.
 */
export function applyAllocation(
  pool: LightPool,
  allocation: LightAllocation,
  luminaires: ReadonlyMap<ObjectId, Luminaire>,
): void {
  pool.points.forEach((light, index) => {
    const luminaire = luminaireAt(allocation.point, index, luminaires);
    if (!luminaire) {
      light.intensity = 0;
      return;
    }
    light.color.set(luminaire.color);
    light.intensity = POINT_INTENSITY * luminaire.intensity;
    light.position.set(...luminaire.position);
  });
  pool.spots.forEach((light, index) => {
    const luminaire = luminaireAt(allocation.spot, index, luminaires);
    if (!luminaire) {
      light.intensity = 0;
      return;
    }
    const [x, y, z] = luminaire.head;
    light.color.set(luminaire.color);
    light.intensity = SPOT_INTENSITY * luminaire.intensity;
    light.position.set(x, y, z);
    light.target.position.set(
      x + Math.sin(luminaire.yaw) * SPOT_REACH_FORWARD,
      y - 1,
      z + Math.cos(luminaire.yaw) * SPOT_REACH_FORWARD,
    );
  });
  pool.group.updateMatrixWorld(true);
}

function luminaireAt(
  slots: readonly (ObjectId | null)[],
  index: number,
  luminaires: ReadonlyMap<ObjectId, Luminaire>,
): Luminaire | undefined {
  const id = slots[index];
  return id == null ? undefined : luminaires.get(id);
}

/** What the pool shows, for tests and tools: its size and the luminaires that have a light now. */
export interface LightPoolInfo {
  points: number;
  spots: number;
  /** Ids of the luminaires lit by a pool light, point slots first. */
  lit: string[];
}
