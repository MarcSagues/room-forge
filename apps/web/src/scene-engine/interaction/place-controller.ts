import {
  addObject,
  type CommandResult,
  type EditorSession,
  type ObjectId,
  type PlacementInput,
  type PlacementResult,
  type RoomId,
  type SupportPlacementInput,
  solveOnSupport,
  solvePlacement,
} from '@roomforge/core';
import { Plane, type Ray, Vector3 } from 'three';
import type { SceneCatalog } from '../canvas/scene-catalog';
import { objectSize } from '../objects/placeholder-resources';
import { SupportTarget } from './support-target';
import type { GhostState, TransientStore } from './transient-store';

export interface PlaceControllerDeps {
  session: EditorSession;
  catalog: SceneCatalog;
  transient: TransientStore;
  /** Requests a frame (`frameloop="demand"`). */
  invalidate(): void;
}

/** A room as the session hands it out: part of the frozen document, never modified here. */
type Room = NonNullable<ReturnType<EditorSession['getState']>['document']['rooms'][RoomId]>;

const floor = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Places an item from the catalog (P3-06). While it is dragged in, a ghost of the item follows the
 * pointer over the floor with the same snap rules as moving an object, or over a desk top when
 * the item may stand on one (P3-13); releasing there creates it with one `object/add` (one
 * history entry; on a desk, as its child) and selects it, releasing anywhere else (outside the
 * viewport, off the floor) creates nothing. The document is untouched until then, and
 * every per-update object is reused: no allocations on the hot path.
 */
export class PlaceController {
  private readonly deps: PlaceControllerDeps;
  private readonly target: SupportTarget;
  private catalogId: string | null = null;
  /** Whether the item may stand on a desk top, and on the floor. */
  private toSupport = false;
  private toFloor = true;
  /** The desk the ghost stands on, or null for the floor. */
  private parentId: ObjectId | null = null;
  private readonly scratch: [number, number] = [0, 0];
  private readonly onSupport: SupportPlacementInput & {
    position: [number, number];
    size: { w: number; d: number };
  } = {
    support: { y: 0, rect: { x: 0, z: 0, w: 0, d: 0 } },
    size: { w: 0, d: 0 },
    position: [0, 0],
    rotationY: 0,
  };
  private readonly supportResult: PlacementResult = {
    position: [0, 0],
    rotationY: 0,
    valid: true,
    reason: null,
    wall: null,
    guides: [],
  };
  private readonly hit = new Vector3();
  /** The room the ghost is in (a reference into the document, not a copy), or null. */
  private room: Room | null = null;
  private legal = false;
  private readonly placed = { x: 0, y: 0, z: 0, rotationY: 0 };
  private readonly input: PlacementInput & {
    position: [number, number];
    size: { w: number; d: number };
  } = {
    room: { width: 0, depth: 0 },
    size: { w: 0, d: 0 },
    position: [0, 0],
    rotationY: 0,
    wallSnap: true,
  };
  private readonly result: PlacementResult = {
    position: [0, 0],
    rotationY: 0,
    valid: true,
    reason: null,
    wall: null,
    guides: [],
  };
  private readonly ghost: GhostState = {
    x: 0,
    y: 0,
    z: 0,
    rotationY: 0,
    w: 0,
    h: 0,
    d: 0,
    valid: false,
    visible: false,
    wall: null,
    color: null,
  };

  constructor(deps: PlaceControllerDeps) {
    this.deps = deps;
    this.target = new SupportTarget(deps.session, deps.catalog);
  }

  get active(): boolean {
    return this.catalogId !== null;
  }

  /** Starts a placement; false when there is no room to place anything in. */
  begin(catalogId: string): boolean {
    const { document } = this.deps.session.getState();
    if (document.roomOrder.length === 0) return false;
    const size = objectSize(this.deps.catalog, catalogId);
    const surfaces = this.deps.catalog.getItem(catalogId)?.placement.surfaces;
    this.toSupport = surfaces?.includes('tabletop') === true;
    this.toFloor = !surfaces || surfaces.some((surface) => surface !== 'tabletop');
    this.onSupport.size.w = size.w;
    this.onSupport.size.d = size.d;
    this.catalogId = catalogId;
    this.room = null;
    this.legal = false;
    this.input.size.w = size.w;
    this.input.size.d = size.d;
    const ghost = this.ghost;
    ghost.w = size.w;
    ghost.h = size.h;
    ghost.d = size.d;
    ghost.color = this.deps.catalog.colorOf?.(catalogId) ?? null;
    ghost.visible = false;
    ghost.valid = false;
    ghost.wall = null;
    this.deps.transient.publishGhost(ghost);
    this.deps.invalidate();
    return true;
  }

  /**
   * One placement step (call at most once per frame). `ray` is the pointer's, or null when the
   * pointer is outside the viewport. `free` (Alt) disables grid and wall snap.
   */
  update(ray: Ray | null, free: boolean): void {
    if (this.catalogId === null) return;
    if (ray && this.solveOnSupport(ray, free)) {
      this.deps.transient.publishGhost(this.ghost);
      this.deps.invalidate();
      return;
    }
    const room = ray?.intersectPlane(floor, this.hit) ? this.roomAt(this.hit.x, this.hit.z) : null;
    if (room) {
      this.solve(room, this.hit.x - room.origin[0], this.hit.z - room.origin[1], free);
    } else {
      this.room = null;
      this.legal = false;
      this.ghost.visible = false;
      this.ghost.valid = false;
      this.ghost.wall = null;
    }
    this.deps.transient.publishGhost(this.ghost);
    this.deps.invalidate();
  }

  /** Drops the item where the ghost is; null (and nothing is created) when it is not over a floor. */
  end(): CommandResult | null {
    const catalogId = this.catalogId;
    let result: CommandResult | null = null;
    if (catalogId !== null && this.legal && this.room) result = this.create(catalogId, this.room);
    this.finish();
    return result;
  }

  /** Abandons the placement: nothing is created. */
  cancel(): void {
    this.finish();
  }

  /**
   * Click or Enter on an item: places it at the point of the floor the centre of the view looks at
   * (`ray`), or in the middle of the first room when it does not look at one.
   */
  placeAtCenter(catalogId: string, ray: Ray | null): CommandResult | null {
    if (!this.begin(catalogId)) return null;
    this.update(ray, false);
    if (!this.legal) {
      const { document } = this.deps.session.getState();
      const room = document.rooms[document.roomOrder[0] as RoomId];
      if (room) this.solve(room, room.shape.width / 2, room.shape.depth / 2, false);
    }
    return this.end();
  }

  /** On a desk top under the pointer, when the item may stand there and fits: true, ghost set. */
  private solveOnSupport(ray: Ray, free: boolean): boolean {
    const target = this.target;
    if (!this.toSupport || !target.find(ray, null, null) || !target.support) return false;
    const { document, snap } = this.deps.session.getState();
    const room = target.roomId ? document.rooms[target.roomId] : undefined;
    if (!room) return false;
    const input = this.onSupport;
    input.support = target.support;
    input.position[0] = target.local[0];
    input.position[1] = target.local[1];
    input.rotationY = 0;
    input.gridStep = snap.enabled && !free ? snap.gridStep : undefined;
    const result = solveOnSupport(input, this.supportResult);
    if (!result.valid) return false;
    this.room = room;
    this.parentId = target.parentId;
    this.legal = true;
    this.placed.x = result.position[0];
    this.placed.y = target.support.y;
    this.placed.z = result.position[1];
    this.placed.rotationY = result.rotationY;
    const ghost = this.ghost;
    target.toWorld(result.position[0], result.position[1], this.scratch);
    ghost.x = this.scratch[0];
    ghost.y = target.height;
    ghost.z = this.scratch[1];
    ghost.rotationY = target.frame.rotationY + result.rotationY;
    ghost.visible = true;
    ghost.valid = true;
    ghost.wall = null;
    return true;
  }

  /** Solves the ghost's pose at `(x, z)` in `room`'s own coordinates and fills the ghost. */
  private solve(room: Room, x: number, z: number, free: boolean) {
    const input = this.input;
    input.room.width = room.shape.width;
    input.room.depth = room.shape.depth;
    input.position[0] = x;
    input.position[1] = z;
    input.rotationY = 0;
    const { snap } = this.deps.session.getState();
    const snapping = snap.enabled && !free;
    input.wallSnap = snapping;
    input.gridStep = snapping ? snap.gridStep : undefined;
    const result = solvePlacement(input, this.result);

    this.room = room;
    this.parentId = null;
    this.legal = result.valid && this.toFloor;
    this.placed.x = result.position[0];
    this.placed.y = 0;
    this.placed.z = result.position[1];
    this.placed.rotationY = result.rotationY;
    const ghost = this.ghost;
    ghost.x = room.origin[0] + result.position[0];
    ghost.y = 0;
    ghost.z = room.origin[1] + result.position[1];
    ghost.rotationY = result.rotationY;
    ghost.visible = true;
    ghost.valid = this.legal;
    ghost.wall = result.wall;
  }

  /** The room whose floor contains the world point, or null (a reference into the document). */
  private roomAt(x: number, z: number): Room | null {
    const { document } = this.deps.session.getState();
    const order = document.roomOrder;
    for (let i = 0; i < order.length; i += 1) {
      const room = document.rooms[order[i] as RoomId];
      if (!room) continue;
      const dx = x - room.origin[0];
      const dz = z - room.origin[1];
      if (dx >= 0 && dz >= 0 && dx <= room.shape.width && dz <= room.shape.depth) return room;
    }
    return null;
  }

  private create(catalogId: string, room: Room): CommandResult {
    const { session } = this.deps;
    const result = session.execute(
      addObject({
        catalogId,
        roomId: room.id,
        parentId: this.parentId,
        position: [this.placed.x, this.placed.y, this.placed.z],
        rotationY: this.placed.rotationY,
      }),
    );
    if (result.ok) {
      const { objectOrder } = session.getState().document;
      const created = objectOrder[objectOrder.length - 1];
      if (created) session.select([created as ObjectId], 'replace');
    }
    return result;
  }

  private finish() {
    this.catalogId = null;
    this.parentId = null;
    this.room = null;
    this.legal = false;
    this.deps.transient.clearGhost();
    this.deps.invalidate();
  }
}
