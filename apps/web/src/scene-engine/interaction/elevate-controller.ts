import {
  type CatalogProvider,
  type CommandResult,
  clampElevation,
  type EditorSession,
  maxElevation,
  type ObjectId,
  setObjectElevations,
  snapToGrid,
} from '@roomforge/core';
import { Plane, type Ray, Vector3 } from 'three';
import type { EntityRegistry } from '../objects/entity-registry';
import { objectSize } from '../objects/placeholder-resources';
import type { DragState, TransientStore } from './transient-store';

export interface ElevateControllerDeps {
  session: EditorSession;
  catalog: CatalogProvider;
  registry: EntityRegistry;
  transient: TransientStore;
  /** Requests a frame (`frameloop="demand"`). */
  invalidate(): void;
}

/** A view closer to straight down than this (horizontal part of the ray) cannot lift: too flat. */
const MIN_HORIZONTAL = 0.15;

/**
 * Raises or lowers a floor object with `Shift` + drag (P3-16), the way `MoveController` moves it:
 * the pointer runs over a vertical plane through the object that faces the camera, the `Object3D`
 * follows on the hot path and the pose goes to the transient store; the document changes once, on
 * release, with one `object/setElevation`. Grid snap applies (Alt or snap off: free) and the height
 * stays between the floor and the ceiling. `cancel` (Esc) puts the object back. No allocations per
 * update.
 */
export class ElevateController {
  private readonly deps: ElevateControllerDeps;
  private id: ObjectId | null = null;
  private readonly hit = new Vector3();
  private readonly normal = new Vector3();
  private readonly centre = new Vector3();
  private readonly plane = new Plane();
  private startY = 0;
  /** Height of the grabbed point above the base, so the object does not jump to the pointer. */
  private grab = 0;
  private max = 0;
  private y = 0;
  private readonly pose: DragState = {
    kind: 'elevate',
    id: '' as ObjectId,
    x: 0,
    y: 0,
    z: 0,
    rotationY: 0,
    valid: true,
    wall: null,
  };

  constructor(deps: ElevateControllerDeps) {
    this.deps = deps;
  }

  get active(): boolean {
    return this.id !== null;
  }

  /**
   * Starts lifting `id`, grabbed where `ray` meets the vertical plane through it. Refuses objects
   * on other objects, locked ones, and views from straight above (the top view), where a vertical
   * plane cannot be hit with any precision.
   */
  begin(id: ObjectId, ray: Ray): boolean {
    const { document } = this.deps.session.getState();
    const object = document.objects[id];
    const room = object ? document.rooms[object.roomId] : undefined;
    const node = this.deps.registry.get(id);
    if (!object || !room || !node || object.parentId !== null || object.locked) return false;
    this.normal.set(ray.direction.x, 0, ray.direction.z);
    if (this.normal.length() < MIN_HORIZONTAL) return false;
    node.getWorldPosition(this.centre);
    this.plane.setFromNormalAndCoplanarPoint(this.normal.normalize(), this.centre);
    if (!ray.intersectPlane(this.plane, this.hit)) return false;

    const [x, y, z] = object.transform.position;
    const scaleY = object.transform.scale?.[1] ?? 1;
    this.id = id;
    this.startY = y;
    this.y = y;
    this.grab = this.hit.y - y;
    this.max = maxElevation(room.height, objectSize(this.deps.catalog, object.catalogId).h, scaleY);
    const pose = this.pose;
    pose.id = id;
    pose.x = x;
    pose.y = y;
    pose.z = z;
    pose.rotationY = object.transform.rotationY;
    pose.valid = true;
    this.deps.transient.publishDrag(pose);
    return true;
  }

  /** One lift step (call at most once per frame). `free` (Alt) or snap off: no grid. */
  update(ray: Ray, free: boolean): void {
    const id = this.id;
    const node = id ? this.deps.registry.get(id) : undefined;
    if (!id || !node || !ray.intersectPlane(this.plane, this.hit)) return;
    // Rooms sit at floor level (world y = 0), so world height and elevation are the same.
    const wanted = this.hit.y - this.grab;
    const { snap } = this.deps.session.getState();
    const snapped = snap.enabled && !free ? snapToGrid(wanted, snap.gridStep) : wanted;
    this.y = clampElevation(snapped, this.max);
    node.position.y = this.y;
    this.pose.y = this.y;
    this.deps.transient.publishDrag(this.pose);
    this.deps.invalidate();
  }

  /** Ends the lift with one command; null when the height did not change. */
  end(): CommandResult | null {
    const id = this.id;
    if (!id) return null;
    let result: CommandResult | null = null;
    if (this.y !== this.startY) {
      result = this.deps.session.execute(setObjectElevations([{ id, elevation: this.y }]));
      if (!result.ok) this.restore(id);
    }
    this.finish();
    return result;
  }

  /** Abandons the lift (Esc): the object goes back, nothing is recorded. */
  cancel(): void {
    if (this.id) this.restore(this.id);
    this.finish();
  }

  private restore(id: ObjectId) {
    const node = this.deps.registry.get(id);
    if (node) node.position.y = this.startY;
  }

  private finish() {
    this.id = null;
    this.deps.transient.clearDrag();
    this.deps.invalidate();
  }
}
