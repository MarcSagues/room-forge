import type { WallId } from '@roomforge/core';

/** Placement of a unit-length segment (local +x, 0..1) so it covers a wall's base line. */
export interface GuidePose {
  x: number;
  z: number;
  length: number;
  rotationY: number;
}

/**
 * Where the dashed guide of the wall an object snapped to goes, in world metres (room corner at
 * `originX, originZ`). Fills `out` so the per-frame caller allocates nothing.
 */
export function wallGuidePose(
  wall: WallId,
  width: number,
  depth: number,
  originX: number,
  originZ: number,
  out: GuidePose,
): GuidePose {
  const alongX = wall === 'north' || wall === 'south';
  out.x = originX + (wall === 'east' ? width : 0);
  out.z = originZ + (wall === 'south' ? depth : 0);
  out.length = alongX ? width : depth;
  // Rotating about Y by -90° turns local +x into world +z (west and east walls run north–south).
  out.rotationY = alongX ? 0 : -Math.PI / 2;
  return out;
}
