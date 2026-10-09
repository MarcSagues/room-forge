import {
  addObject,
  type CommandResult,
  type EditorSession,
  type ObjectId,
  type PlacementInput,
  type PlacementResult,
  type RoomId,
  solvePlacement,
} from '@roomforge/core';
import { Plane, type Ray, Vector3 } from 'three';
import type { SceneCatalog } from '../canvas/scene-catalog';
import { objectSize } from '../objects/placeholder-resources';
import type { GhostState, TransientStore } from './transient-store';

export interface PlaceControllerDeps {
  session: EditorSession;
  catalog: SceneCatalog;
  transient: TransientStore;
  /** Requests a frame (`frameloop="demand"`). */
  invalidate(): void;
  /** Grid snap in metres while placing (Alt disables it). */
  gridStep?: number;
}

const DEFAULT_PLACE_GRID = 0.1;

/** A room as the session hands it out: part of the frozen document, never modified here. */
type Room = NonNullable<ReturnType<EditorSession['getState']>['document']['rooms'][RoomId]>;

const floor = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Places an item from the catalog (P3-06). While it is dragged in, a ghost of the item follows the
 * pointer over the floor with the same snap rules as moving an object; releasing over a floor
 * creates it with one `object/add` (one history entry) and selects it, releasing anywhere else
 * (outside the viewport, off the floor) creates nothing. The document is untouched until then, and
 * every per-update object is reused: no allocations on the hot path.
 */
export class PlaceController {
  private readonly deps: PlaceControllerDeps;
  private catalogId: string | null = null;
  private readonly hit = new Vector3();
  /** The room the ghost is in (a reference into the document, not a copy), or null. */
  private room: Room | null = null;
  private legal = false;
  private readonly placed = { x: 0, z: 0, rotationY: 0 };
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
  }

  get active(): boolean {
    return this.catalogId !== null;
  }

  /** Starts a placement; false when there is no room to place anything in. */
  begin(catalogId: string): boolean {
    const { document } = this.deps.session.getState();
    if (document.roomOrder.length === 0) return false;
    const size = objectSize(this.deps.catalog, catalogId);
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

  /** Solves the ghost's pose at `(x, z)` in `room`'s own coordinates and fills the ghost. */
  private solve(room: Room, x: number, z: number, free: boolean) {
    const input = this.input;
    input.room.width = room.shape.width;
    input.room.depth = room.shape.depth;
    input.position[0] = x;
    input.position[1] = z;
    input.rotationY = 0;
    input.wallSnap = !free;
    input.gridStep = free ? undefined : (this.deps.gridStep ?? DEFAULT_PLACE_GRID);
    const result = solvePlacement(input, this.result);

    this.room = room;
    this.legal = result.valid;
    this.placed.x = result.position[0];
    this.placed.z = result.position[1];
    this.placed.rotationY = result.rotationY;
    const ghost = this.ghost;
    ghost.x = room.origin[0] + result.position[0];
    ghost.z = room.origin[1] + result.position[1];
    ghost.rotationY = result.rotationY;
    ghost.visible = true;
    ghost.valid = result.valid;
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
        position: [this.placed.x, 0, this.placed.z],
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
    this.room = null;
    this.legal = false;
    this.deps.transient.clearGhost();
    this.deps.invalidate();
  }
}
