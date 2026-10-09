import type { ObjectId, SessionState } from '@roomforge/core';
import { Plane, type Ray, Vector3 } from 'three';

/** How far the ring stands off the corners of the footprint (metres). */
export const HANDLE_GAP = 0.2;
/** Half the width of the ring that can be grabbed (metres). */
export const RING_BAND = 0.1;
/** Radius of the knob's grab area: bigger than it is drawn, so it is easy to hit. */
export const KNOB_GRAB = 0.18;

const floor = new Plane(new Vector3(0, 1, 0), 0);
const hit = new Vector3();

/**
 * The object the rotation handle belongs to: the single selected one, if it stands on a room and
 * can be changed. Objects on other objects turn with the tabletop rules (#46).
 */
export function handleTarget(state: Pick<SessionState, 'selection' | 'document'>): ObjectId | null {
  if (state.selection.length !== 1) return null;
  const id = state.selection[0] as ObjectId;
  const object = state.document.objects[id];
  if (!object || object.parentId !== null || object.locked || object.hidden) return null;
  return id;
}

/** Radius of the ring around a footprint of `size`, scaled by `scale`. */
export function handleRadius(
  size: { w: number; d: number },
  scale: readonly [number, number, number] | undefined,
): number {
  const [sx, , sz] = scale ?? [1, 1, 1];
  const w = size.w * sx;
  const d = size.d * sz;
  // Not Math.hypot: it allocates on every call, and this runs on every hover frame.
  return Math.sqrt(w * w + d * d) / 2 + HANDLE_GAP;
}

/** Where the knob is on the floor: `radius` in front of the object (+z at rotation 0). */
export function knobPosition(
  x: number,
  z: number,
  rotationY: number,
  radius: number,
  out: [number, number],
): [number, number] {
  out[0] = x + Math.sin(rotationY) * radius;
  out[1] = z + Math.cos(rotationY) * radius;
  return out;
}

const knob: [number, number] = [0, 0];

/**
 * Whether `ray` grabs the handle of an object centred at `(x, z)` (world metres): the knob always
 * does; the rest of the ring only where no object is under the pointer, so a crowded scene does not
 * lose its objects to the ring around the selected one. Allocates nothing.
 */
export function hitsHandle(
  ray: Ray,
  x: number,
  z: number,
  rotationY: number,
  radius: number,
  objectUnderPointer: boolean,
): boolean {
  if (!ray.intersectPlane(floor, hit)) return false;
  knobPosition(x, z, rotationY, radius, knob);
  const kx = hit.x - (knob[0] as number);
  const kz = hit.z - (knob[1] as number);
  if (kx * kx + kz * kz <= KNOB_GRAB * KNOB_GRAB) return true;
  if (objectUnderPointer) return false;
  const rx = hit.x - x;
  const rz = hit.z - z;
  return Math.abs(Math.sqrt(rx * rx + rz * rz) - radius) <= RING_BAND;
}
