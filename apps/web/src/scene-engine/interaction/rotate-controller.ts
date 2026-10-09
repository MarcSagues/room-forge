import {
  type CatalogProvider,
  type CommandResult,
  type EditorSession,
  moveObjects,
  normalizeAngle,
  type ObjectId,
  rotateObjects,
  snapAngle,
} from '@roomforge/core';
import { Plane, type Ray, Vector3 } from 'three';
import type { EntityRegistry } from '../objects/entity-registry';
import { objectSize } from '../objects/placeholder-resources';
import { pointerAngle, type RotationInput, type RotationResult, solveRotation } from './rotation';
import type { DragState, TransientStore } from './transient-store';

export interface RotateControllerDeps {
  session: EditorSession;
  catalog: CatalogProvider;
  registry: EntityRegistry;
  transient: TransientStore;
  /** Requests a frame (`frameloop="demand"`). */
  invalidate(): void;
}

const floor = new Plane(new Vector3(0, 1, 0), 0);

/** Positions closer than this to the centre have no usable direction. */
const MIN_RADIUS = 1e-3;

/**
 * Turns a floor object with the rotation handle, the way `MoveController` moves it: while the
 * pointer moves the controller sets the `Object3D` directly and publishes the pose to the transient
 * store; the document changes once, on release, with a single command (one history entry). The
 * turned footprint is kept inside the room by pushing the object inwards; a turn that cannot fit
 * is blocked (the object stays where it was and the pose is flagged invalid). `cancel` puts the
 * object back. Every per-update object is reused: no allocations on the hot path.
 */
export class RotateController {
  private readonly deps: RotateControllerDeps;
  private id: ObjectId | null = null;
  private readonly hit = new Vector3();
  private readonly start = { x: 0, y: 0, z: 0, rotationY: 0 };
  /** World position of the centre of the object. */
  private readonly centre = { x: 0, z: 0 };
  private readonly origin = { x: 0, z: 0 };
  private grabAngle = 0;
  private moved = false;
  /** The last pose that was legal: what a release commits. */
  private readonly accepted = { x: 0, z: 0, rotationY: 0 };
  private readonly request: RotationInput & {
    position: [number, number];
    size: { w: number; d: number };
  } = {
    room: { width: 0, depth: 0 },
    size: { w: 0, d: 0 },
    position: [0, 0],
    rotationY: 0,
  };
  private readonly result: RotationResult = { position: [0, 0], rotationY: 0, valid: true };
  private readonly pose: DragState = {
    kind: 'rotate',
    id: '' as ObjectId,
    x: 0,
    z: 0,
    rotationY: 0,
    valid: true,
    wall: null,
  };

  constructor(deps: RotateControllerDeps) {
    this.deps = deps;
  }

  get active(): boolean {
    return this.id !== null;
  }

  /**
   * Starts turning `id`, grabbed where `ray` meets the floor (the handle). Only unlocked objects
   * standing on a room can be turned here.
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
    this.accepted.x = x;
    this.accepted.z = z;
    this.accepted.rotationY = object.transform.rotationY;
    this.origin.x = room.origin[0];
    this.origin.z = room.origin[1];
    this.centre.x = this.origin.x + x;
    this.centre.z = this.origin.z + z;
    this.request.room.width = room.shape.width;
    this.request.room.depth = room.shape.depth;
    this.request.size.w = size.w * sx;
    this.request.size.d = size.d * sz;
    this.grabAngle = this.angleOf(this.hit.x, this.hit.z, this.start.rotationY);
    // Published from the press, so the camera rig locks its input before the pointer moves.
    const pose = this.pose;
    pose.id = id;
    pose.x = x;
    pose.z = z;
    pose.rotationY = this.start.rotationY;
    pose.valid = true;
    this.deps.transient.publishDrag(pose);
    return true;
  }

  /** One turn step (call at most once per frame). `free` (Alt) or snap off: no angle snap. */
  update(ray: Ray, free: boolean): void {
    const id = this.id;
    const node = id ? this.deps.registry.get(id) : undefined;
    if (!id || !node || !ray.intersectPlane(floor, this.hit)) return;

    // Keep the point that was grabbed under the pointer: only the change of angle counts.
    const pointer = this.angleOf(this.hit.x, this.hit.z, this.grabAngle);
    const wanted = this.start.rotationY + (pointer - this.grabAngle);
    const request = this.request;
    const { snap } = this.deps.session.getState();
    request.rotationY =
      free || !snap.enabled ? normalizeAngle(wanted) : snapAngle(wanted, snap.angleStepDeg);
    request.position[0] = this.start.x;
    request.position[1] = this.start.z;
    const result = solveRotation(request, this.result);

    const pose = this.pose;
    pose.id = id;
    pose.valid = result.valid;
    if (result.valid) {
      node.position.x = result.position[0];
      node.position.z = result.position[1];
      node.rotation.y = result.rotationY;
      this.accepted.x = result.position[0];
      this.accepted.z = result.position[1];
      this.accepted.rotationY = result.rotationY;
      this.moved =
        result.position[0] !== this.start.x ||
        result.position[1] !== this.start.z ||
        result.rotationY !== this.start.rotationY;
    }
    pose.x = this.accepted.x;
    pose.z = this.accepted.z;
    pose.rotationY = result.valid ? result.rotationY : request.rotationY;
    this.deps.transient.publishDrag(pose);
    this.deps.invalidate();
  }

  /**
   * Ends the turn with one command; null when nothing turned or the last pose was not legal.
   * Restores the pose if the document refuses it.
   */
  end(): CommandResult | null {
    const id = this.id;
    if (!id) return null;
    let result: CommandResult | null = null;
    const legal = this.pose.valid;
    if (this.moved && legal) {
      const { x, z, rotationY } = this.accepted;
      const pushed = x !== this.start.x || z !== this.start.z;
      result = this.deps.session.execute(
        pushed
          ? moveObjects([{ id, position: [x, this.start.y, z], rotationY }])
          : rotateObjects([{ id, rotationY }]),
      );
    }
    if (!legal || (result && !result.ok)) this.restore(id);
    this.finish();
    return result;
  }

  /** Abandons the turn (Esc): the object goes back, nothing is recorded. */
  cancel(): void {
    if (this.id) this.restore(this.id);
    this.finish();
  }

  /** Direction of a floor point as seen from the centre; `fallback` when it is on the centre. */
  private angleOf(x: number, z: number, fallback: number): number {
    const dx = x - this.centre.x;
    const dz = z - this.centre.z;
    return dx * dx + dz * dz < MIN_RADIUS * MIN_RADIUS ? fallback : pointerAngle(dx, dz);
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
    this.pose.valid = true;
    this.deps.transient.clearDrag();
    this.deps.invalidate();
  }
}
