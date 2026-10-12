import {
  type CatalogProvider,
  type EditorSession,
  intersectRaySupport,
  type ObjectId,
  type RoomId,
  type SupportFrame,
  type SupportSurface,
  supportToRoom,
} from '@roomforge/core';
import type { Ray } from 'three';

type Doc = ReturnType<EditorSession['getState']>['document'];
type Placed = NonNullable<Doc['objects'][ObjectId]>;

/** Writes where `object` stands, in world metres (its room origin added), into `out`. */
export function writeWorldFrame(doc: Doc, object: Placed, out: SupportFrame): SupportFrame {
  const room = doc.rooms[object.roomId];
  // Indexed, not destructured: destructuring goes through an array iterator (an allocation).
  const position = object.transform.position;
  const scale = object.transform.scale;
  out.x = (room?.origin[0] ?? 0) + position[0];
  out.y = position[1];
  out.z = (room?.origin[1] ?? 0) + position[2];
  out.rotationY = object.transform.rotationY;
  out.sx = scale?.[0] ?? 1;
  out.sy = scale?.[1] ?? 1;
  out.sz = scale?.[2] ?? 1;
  return out;
}

export const emptyFrame = (): SupportFrame => ({
  x: 0,
  y: 0,
  z: 0,
  rotationY: 0,
  sx: 1,
  sy: 1,
  sz: 1,
});

function copyFrame(from: SupportFrame, to: SupportFrame) {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.rotationY = from.rotationY;
  to.sx = from.sx;
  to.sy = from.sy;
  to.sz = from.sz;
}

/** True when `id` has objects standing on it (so it cannot stand on another one: depth ≤ 2). */
export function hasChildren(doc: Doc, id: ObjectId): boolean {
  const order = doc.objectOrder;
  for (let i = 0; i < order.length; i += 1) {
    if (doc.objects[order[i] as ObjectId]?.parentId === id) return true;
  }
  return false;
}

/**
 * Finds the support surface (a desk top, P3-13) under a pointer ray, for the drag and placement
 * controllers: the visible floor objects whose catalog item declares `supports`, tested
 * analytically (plane, then rectangle); the nearest along the ray wins. What it found stays in its
 * fields until the next `find`; nothing is allocated per call (hot path).
 */
export class SupportTarget {
  private readonly session: EditorSession;
  private readonly catalog: CatalogProvider;
  /** The object found, its room, the surface and its world frame, and the point on it (local). */
  parentId: ObjectId | null = null;
  roomId: RoomId | null = null;
  support: SupportSurface | null = null;
  readonly frame: SupportFrame = emptyFrame();
  readonly local: [number, number] = [0, 0];
  private readonly candidate: SupportFrame = emptyFrame();
  private readonly hit: [number, number] = [0, 0];
  private readonly origin: [number, number, number] = [0, 0, 0];
  private readonly direction: [number, number, number] = [0, 0, 0];

  constructor(session: EditorSession, catalog: CatalogProvider) {
    this.session = session;
    this.catalog = catalog;
  }

  /**
   * Looks for a surface the ray meets with `shift` (world metres) subtracted from the point: the
   * offset of the grabbed point from the dragged object's centre. `exclude` (the dragged object)
   * and objects outside `roomId` (when given) are skipped. False when there is none.
   */
  find(
    ray: Ray,
    exclude: ObjectId | null,
    roomId: RoomId | null,
    shift?: readonly [number, number],
  ): boolean {
    const doc = this.session.getState().document;
    this.origin[0] = ray.origin.x;
    this.origin[1] = ray.origin.y;
    this.origin[2] = ray.origin.z;
    this.direction[0] = ray.direction.x;
    this.direction[1] = ray.direction.y;
    this.direction[2] = ray.direction.z;
    let best = Number.POSITIVE_INFINITY;
    this.parentId = null;
    this.roomId = null;
    this.support = null;
    const order = doc.objectOrder;
    for (let i = 0; i < order.length; i += 1) {
      const object = doc.objects[order[i] as ObjectId];
      if (!object || object.id === exclude || object.parentId !== null || object.hidden) continue;
      if (roomId !== null && object.roomId !== roomId) continue;
      const supports = this.catalog.getItem(object.catalogId)?.supports;
      if (!supports) continue;
      writeWorldFrame(doc, object, this.candidate);
      for (let j = 0; j < supports.length; j += 1) {
        const support = supports[j] as SupportSurface;
        const t = intersectRaySupport(
          this.origin,
          this.direction,
          this.candidate,
          support,
          this.hit,
          shift,
        );
        if (t < 0 || t >= best) continue;
        best = t;
        this.parentId = object.id;
        this.roomId = object.roomId;
        this.support = support;
        copyFrame(this.candidate, this.frame);
        this.local[0] = this.hit[0];
        this.local[1] = this.hit[1];
      }
    }
    return this.parentId !== null;
  }

  /** A point of the found surface's frame in world metres, written into `out` as `[x, z]`. */
  toWorld(lx: number, lz: number, out: [number, number]): [number, number] {
    return supportToRoom(this.frame, lx, lz, out);
  }

  /** Height of the found surface in world metres. */
  get height(): number {
    return this.frame.y + (this.support?.y ?? 0) * this.frame.sy;
  }
}
