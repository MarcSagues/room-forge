/**
 * The swing of a door leaf (P10-02, DOMAIN_MODEL §8.1), in room-local metres like the rest of
 * `geometry`. A leaf turns about its hinge from closed (along the wall) up to `open × 90°`; the area
 * it sweeps is a quarter disc whose depth into the room is `leafWidth × sin(angle)`. Pure and
 * allocation-free (the swept box goes into an `out` object).
 */

import type { WallId } from '../domain';
import { GEOMETRY_TOLERANCE } from './basics';
import type { RoomBox } from './openings';

/** Widest a door opens: `open = 1`. */
export const DOOR_MAX_ANGLE = Math.PI / 2;

/** The door as the swing needs it. */
export interface DoorShape {
  readonly wall: WallId;
  readonly variant: string;
  readonly offset: number;
  readonly width: number;
  readonly swing?: 'in' | 'out';
  readonly open?: number;
}

/** A double door has two leaves, one on each jamb; every other door has one. */
export function doorLeafCount(variant: string): 1 | 2 {
  return variant === 'door.double' ? 2 : 1;
}

/** The angle of the leaf, in radians, for an `open` fraction (clamped to 0…1). */
export function doorAngle(open: number): number {
  return Math.min(Math.max(open, 0), 1) * DOOR_MAX_ANGLE;
}

/**
 * How far the leaf reaches out of the wall at its current angle. The whole hole width counts as
 * leaf (the frame is thinner than the tolerance this guards), so the answer errs on the safe side.
 */
export function doorSweepDepth(door: DoorShape): number {
  const leaf = door.width / doorLeafCount(door.variant);
  return leaf * Math.sin(doorAngle(door.open ?? 0));
}

/** Depth of the room measured away from `wall`: how far a leaf opening inwards can reach. */
function roomDepthFrom(room: RoomBox, wall: WallId): number {
  return wall === 'north' || wall === 'south' ? room.depth : room.width;
}

/**
 * Whether the open leaf stays clear of the walls (I4). Inwards it must not reach the opposite
 * wall; outwards a single room has no wall to cross (walls shared with another room arrive with
 * P10-04). Along the wall the leaf never leaves the hole, so the side walls cannot be hit.
 */
export function doorSweepFits(room: RoomBox, door: DoorShape): boolean {
  if (door.swing === 'out') return true;
  return doorSweepDepth(door) <= roomDepthFrom(room, door.wall) + GEOMETRY_TOLERANCE;
}

/**
 * The widest `open` (0…1) whose sweep still fits (see `doorSweepFits`): 1 unless the leaf is
 * longer than the room is deep, then the angle at which it would touch the opposite wall.
 */
export function doorMaxOpen(room: RoomBox, door: DoorShape): number {
  if (door.swing === 'out') return 1;
  const leaf = door.width / doorLeafCount(door.variant);
  const depth = roomDepthFrom(room, door.wall);
  if (leaf <= depth) return 1;
  return Math.asin(depth / leaf) / DOOR_MAX_ANGLE;
}

/** An axis-aligned box on the floor, in room-local metres. */
export interface FloorBox {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * The floor box that holds what the leaf sweeps inside the room, or `false` if it sweeps nothing
 * there (closed, or opening outwards). The quarter disc lies within the hole along the wall and
 * `doorSweepDepth` into the room, so its bounding box is exact enough for a warning.
 */
export function doorSweepBox(room: RoomBox, door: DoorShape, out: FloorBox): FloorBox | false {
  const depth = doorSweepDepth(door);
  if (door.swing === 'out' || depth <= GEOMETRY_TOLERANCE) return false;
  const start = door.offset;
  const end = door.offset + door.width;
  switch (door.wall) {
    case 'north':
      return set(out, start, 0, end, depth);
    case 'east':
      return set(out, room.width - depth, start, room.width, end);
    case 'south':
      return set(out, room.width - end, room.depth - depth, room.width - start, room.depth);
    case 'west':
      return set(out, 0, room.depth - end, depth, room.depth - start);
  }
}

function set(out: FloorBox, minX: number, minZ: number, maxX: number, maxZ: number): FloorBox {
  out.minX = minX;
  out.minZ = minZ;
  out.maxX = maxX;
  out.maxZ = maxZ;
  return out;
}
