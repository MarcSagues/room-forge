import type { EntityId } from '@roomforge/core';
import { Box3, Matrix4, type Ray, Vector3 } from 'three';

/**
 * An invisible collision box for one object (R3F_PERFORMANCE §2.11): picking tests a ray against
 * one box per object instead of the visual meshes. The box is in the object's local frame (origin
 * at the centre of its footprint, on the floor); `matrixWorld` places it in the scene.
 */
export interface PickProxy {
  id: EntityId;
  matrixWorld: Matrix4;
  /** Object size in metres (`w × h × d`), before the object's own scale. */
  size: { w: number; h: number; d: number };
}

export interface PickHit {
  id: EntityId;
  distance: number;
}

// Scratch objects: picking runs at most once per frame on pointer moves, with no allocations.
const inverse = new Matrix4();
const localRay = { origin: new Vector3(), direction: new Vector3() };
const box = new Box3();
const hitLocal = new Vector3();
const hitWorld = new Vector3();

/**
 * The nearest proxy the ray goes through, or null. Analytic ray–box test in each proxy's local
 * frame, so rotated and scaled objects pick exactly along their oriented box.
 */
export function pickEntity(ray: Ray, proxies: Iterable<PickProxy>): PickHit | null {
  let best: PickHit | null = null;
  for (const proxy of proxies) {
    inverse.copy(proxy.matrixWorld).invert();
    localRay.origin.copy(ray.origin).applyMatrix4(inverse);
    // Directions ignore translation; no need to normalise for the hit test.
    localRay.direction.copy(ray.direction).transformDirection(inverse);
    const { w, h, d } = proxy.size;
    box.min.set(-w / 2, 0, -d / 2);
    box.max.set(w / 2, h, d / 2);
    if (!intersect(localRay, box, hitLocal)) continue;
    hitWorld.copy(hitLocal).applyMatrix4(proxy.matrixWorld);
    const distance = hitWorld.distanceTo(ray.origin);
    if (!best || distance < best.distance) best = { id: proxy.id, distance };
  }
  return best;
}

/** Ray–AABB (slab method) without building a three Ray per proxy. */
function intersect(
  ray: { origin: Vector3; direction: Vector3 },
  target: Box3,
  out: Vector3,
): boolean {
  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;
  for (const axis of ['x', 'y', 'z'] as const) {
    const origin = ray.origin[axis];
    const direction = ray.direction[axis];
    const min = target.min[axis];
    const max = target.max[axis];
    if (Math.abs(direction) < 1e-12) {
      if (origin < min || origin > max) return false;
      continue;
    }
    let t1 = (min - origin) / direction;
    let t2 = (max - origin) / direction;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  out.copy(ray.direction).multiplyScalar(tMin).add(ray.origin);
  return true;
}
