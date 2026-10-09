import {
  type CatalogProvider,
  type CommandResult,
  type EditorSession,
  moveObjects,
  type ObjectId,
  type PlacementInput,
  type PlacementResult,
  solvePlacement,
} from '@roomforge/core';
import { Plane, type Ray, Vector3 } from 'three';
import type { EntityRegistry } from '../objects/entity-registry';
import { objectSize } from '../objects/placeholder-resources';
import type { DragState, TransientStore } from './transient-store';

export interface MoveControllerDeps {
  session: EditorSession;
  catalog: CatalogProvider;
  registry: EntityRegistry;
  transient: TransientStore;
  /** Requests a frame (`frameloop="demand"`). */
  invalidate(): void;
  /** Grid snap in metres while dragging (Alt disables it). */
  gridStep?: number;
}

export const DEFAULT_DRAG_GRID = 0.1;

const floor = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Drags a floor object (ARCHITECTURE §4.2). While the pointer moves the controller mutates the
 * object's `Object3D` directly and publishes the pose to the transient store; the document only
 * changes once, on release, with a single `object/move` (one history entry, including the turn a
 * wall snap may have chosen). `cancel` puts the object back. Every per-update object is reused:
 * no allocations on the hot path.
 */
export class MoveController {
  private readonly deps: MoveControllerDeps;
  private id: ObjectId | null = null;
  private readonly hit = new Vector3();
  private readonly start = { x: 0, y: 0, z: 0, rotationY: 0 };
  private readonly grab = { x: 0, z: 0 };
  private readonly origin = { x: 0, z: 0 };
  private moved = false;
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
  private readonly pose: DragState = {
    id: '' as ObjectId,
    x: 0,
    z: 0,
    rotationY: 0,
    valid: true,
    wall: null,
  };

  constructor(deps: MoveControllerDeps) {
    this.deps = deps;
  }

  get active(): boolean {
    return this.id !== null;
  }

  /**
   * Starts dragging `id` from where `ray` meets the floor. Only unlocked objects standing on a
   * room can be dragged here; objects on other objects move with the tabletop rules (#46).
   */
  begin(id: ObjectId, ray: Ray): boolean {
    const { document } = this.deps.session.getState();
    const object = document.objects[id];
    const room = object ? document.rooms[object.roomId] : undefined;
    const node = this.deps.registry.get(id);
    if (!object || !room || !node || object.parentId !== null || object.locked) return false;
    if (!ray.intersectPlane(floor, this.hit)) return false;

    const [x, y, z] = object.transform.position;
    const [sx, , sz] = object.transform.scale ?? [1, 1, 1];
    const size = objectSize(this.deps.catalog, object.catalogId);
    this.id = id;
    this.moved = false;
    this.start.x = x;
    this.start.y = y;
    this.start.z = z;
    this.start.rotationY = object.transform.rotationY;
    this.origin.x = room.origin[0];
    this.origin.z = room.origin[1];
    // Keep the point that was grabbed under the pointer instead of jumping to the centre.
    this.grab.x = this.hit.x - this.origin.x - x;
    this.grab.z = this.hit.z - this.origin.z - z;
    this.input.room.width = room.shape.width;
    this.input.room.depth = room.shape.depth;
    this.input.size.w = size.w * sx;
    this.input.size.d = size.d * sz;
    return true;
  }

  /** One drag step (call at most once per frame). `free` (Alt) disables grid and wall snap. */
  update(ray: Ray, free: boolean): void {
    const id = this.id;
    const node = id ? this.deps.registry.get(id) : undefined;
    if (!id || !node || !ray.intersectPlane(floor, this.hit)) return;

    const input = this.input;
    input.position[0] = this.hit.x - this.origin.x - this.grab.x;
    input.position[1] = this.hit.z - this.origin.z - this.grab.z;
    // Always solve from the original orientation: leaving a wall turns the object back.
    input.rotationY = this.start.rotationY;
    input.wallSnap = !free;
    input.gridStep =
      free || this.deps.gridStep === 0 ? undefined : (this.deps.gridStep ?? DEFAULT_DRAG_GRID);
    const result = solvePlacement(input, this.result);

    node.position.x = result.position[0];
    node.position.z = result.position[1];
    node.rotation.y = result.rotationY;
    this.moved ||=
      result.position[0] !== this.start.x ||
      result.position[1] !== this.start.z ||
      result.rotationY !== this.start.rotationY;

    const pose = this.pose;
    pose.id = id;
    pose.x = result.position[0];
    pose.z = result.position[1];
    pose.rotationY = result.rotationY;
    pose.valid = result.valid;
    pose.wall = result.wall;
    this.deps.transient.publishDrag(pose);
    this.deps.invalidate();
  }

  /** Ends the drag with one `object/move`; null when nothing moved. Restores the pose if rejected. */
  end(): CommandResult | null {
    const id = this.id;
    if (!id) return null;
    let result: CommandResult | null = null;
    if (this.moved) {
      result = this.deps.session.execute(
        moveObjects([
          {
            id,
            position: [this.result.position[0], this.start.y, this.result.position[1]],
            rotationY: this.result.rotationY,
          },
        ]),
      );
      if (!result.ok) this.restore(id);
    }
    this.finish();
    return result;
  }

  /** Abandons the drag (Esc): the object goes back, nothing is recorded. */
  cancel(): void {
    if (this.id) this.restore(this.id);
    this.finish();
  }

  private restore(id: ObjectId) {
    const node = this.deps.registry.get(id);
    if (!node) return;
    node.position.set(this.start.x, this.start.y, this.start.z);
    node.rotation.y = this.start.rotationY;
  }

  private finish() {
    this.id = null;
    this.moved = false;
    this.deps.transient.clearDrag();
    this.deps.invalidate();
  }
}
