import {
  type CatalogProvider,
  type CommandResult,
  type EditorSession,
  moveObjects,
  normalizeAngle,
  type ObjectId,
  type PlacementInput,
  type PlacementResult,
  type RoomId,
  reparentObject,
  roomToSupport,
  type SupportFrame,
  type SupportPlacementInput,
  solveOnSupport,
  solvePlacement,
  supportToRoom,
} from '@roomforge/core';
import { Plane, Ray, Vector3 } from 'three';
import type { EntityRegistry } from '../objects/entity-registry';
import { objectSize } from '../objects/placeholder-resources';
import { emptyFrame, hasChildren, SupportTarget, writeWorldFrame } from './support-target';
import type { DragState, TransientStore } from './transient-store';

export interface MoveControllerDeps {
  session: EditorSession;
  catalog: CatalogProvider;
  registry: EntityRegistry;
  transient: TransientStore;
  /** Requests a frame (`frameloop="demand"`). */
  invalidate(): void;
}

const floor = new Plane(new Vector3(0, 1, 0), 0);
const emptyResult = (): PlacementResult => ({
  position: [0, 0],
  rotationY: 0,
  valid: true,
  reason: null,
  wall: null,
  guides: [],
});

/**
 * Drags an object over the floor or from one support surface to another (ARCHITECTURE §4.2,
 * P3-13). While the pointer moves the controller mutates the object's `Object3D` directly and
 * publishes the pose to the transient store; the document only changes once, on release, with a
 * single `object/move` (one history entry, including the turn a wall snap may have chosen), or an
 * `object/reparent` when the object lands on another desk or leaves one for the floor. `cancel`
 * puts the object back. Every per-update object is reused: no allocations on the hot path.
 */
export class MoveController {
  private readonly deps: MoveControllerDeps;
  private readonly target: SupportTarget;
  private id: ObjectId | null = null;
  private roomId: RoomId | null = null;
  private startParent: ObjectId | null = null;
  /** Whether it may stand on a desk (a `tabletop` item without objects on it) or on the floor. */
  private toSupport = false;
  private toFloor = true;
  private readonly hit = new Vector3();
  private readonly grabPlane = new Plane(new Vector3(0, 1, 0), 0);
  /** The pose at the start, in the frame it is stored in (room or parent). */
  private readonly start = { x: 0, y: 0, z: 0, rotationY: 0 };
  /** World turn at the start: drags solve from it (plus the user's turn). */
  private startWorldTurn = 0;
  /** Offset from the object's centre to the grabbed point, in world metres. */
  private readonly grab: [number, number] = [0, 0];
  private readonly origin = { x: 0, z: 0 };
  /** World frame of what the `Object3D` hangs from: its room, or the desk it stood on. */
  private readonly nodeFrame: SupportFrame = emptyFrame();
  private moved = false;
  /** Extra turn (radians) the user added with the wheel or `R` during this drag. */
  private turn = 0;
  /** The last pointer ray, so that a turn can be applied without a pointer move. */
  private readonly lastRay = new Ray();
  private lastFree = false;
  private hasRay = false;
  /** Where a drop would put it: parent (null = floor) and pose in that frame. */
  private readonly drop = {
    parentId: null as ObjectId | null,
    x: 0,
    y: 0,
    z: 0,
    rotationY: 0,
    valid: true,
  };
  private readonly world = { x: 0, y: 0, z: 0, rotationY: 0 };
  private readonly scratch: [number, number] = [0, 0];
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
  private readonly onSupport: SupportPlacementInput & {
    position: [number, number];
    size: { w: number; d: number };
  } = {
    support: { y: 0, rect: { x: 0, z: 0, w: 0, d: 0 } },
    size: { w: 0, d: 0 },
    position: [0, 0],
    rotationY: 0,
  };
  private readonly result: PlacementResult = emptyResult();
  private readonly supportResult: PlacementResult = emptyResult();
  private readonly pose: DragState = {
    kind: 'move',
    id: '' as ObjectId,
    x: 0,
    z: 0,
    rotationY: 0,
    valid: true,
    wall: null,
  };

  constructor(deps: MoveControllerDeps) {
    this.deps = deps;
    this.target = new SupportTarget(deps.session, deps.catalog);
  }

  get active(): boolean {
    return this.id !== null;
  }

  /**
   * Starts dragging `id` from where `ray` meets the plane it stands on (the floor, or its desk
   * top). Locked objects cannot be dragged.
   */
  begin(id: ObjectId, ray: Ray): boolean {
    const { document } = this.deps.session.getState();
    const object = document.objects[id];
    const room = object ? document.rooms[object.roomId] : undefined;
    const node = this.deps.registry.get(id);
    const parent = object?.parentId ? document.objects[object.parentId] : undefined;
    if (!object || !room || !node || object.locked || (object.parentId && !parent)) return false;

    // What the node hangs from, in world metres: the room's frame, or the desk's.
    const frame = this.nodeFrame;
    if (parent) writeWorldFrame(document, parent, frame);
    else Object.assign(frame, emptyFrame(), { x: room.origin[0], z: room.origin[1] });
    const [x, y, z] = object.transform.position;
    const baseY = parent ? frame.y + y * frame.sy : 0;
    this.grabPlane.constant = -baseY;
    if (!ray.intersectPlane(parent ? this.grabPlane : floor, this.hit)) return false;

    const item = this.deps.catalog.getItem(object.catalogId);
    const surfaces = item?.placement.surfaces;
    this.toSupport = surfaces?.includes('tabletop') === true && !hasChildren(document, id);
    this.toFloor = !surfaces || surfaces.some((surface) => surface !== 'tabletop');
    const [sx, , sz] = object.transform.scale ?? [1, 1, 1];
    const size = objectSize(this.deps.catalog, object.catalogId);
    this.id = id;
    this.roomId = object.roomId;
    this.startParent = object.parentId;
    this.moved = false;
    this.turn = 0;
    this.hasRay = false;
    this.start.x = x;
    this.start.y = y;
    this.start.z = z;
    this.start.rotationY = object.transform.rotationY;
    this.startWorldTurn = normalizeAngle(frame.rotationY + object.transform.rotationY);
    this.origin.x = room.origin[0];
    this.origin.z = room.origin[1];
    // Keep the point that was grabbed under the pointer instead of jumping to the centre.
    const centre = supportToRoom(frame, x, z, this.scratch);
    this.grab[0] = this.hit.x - centre[0];
    this.grab[1] = this.hit.z - centre[1];
    this.input.room.width = room.shape.width;
    this.input.room.depth = room.shape.depth;
    this.input.size.w = size.w * sx;
    this.input.size.d = size.d * sz;
    this.onSupport.size.w = size.w * sx;
    this.onSupport.size.d = size.d * sz;
    Object.assign(this.drop, { parentId: object.parentId, x, y, z, valid: true });
    this.drop.rotationY = this.start.rotationY;
    // Published from the start so that readers (the camera rig locks its input) react to the press,
    // not only to the first pointer move.
    const pose = this.pose;
    pose.id = id;
    pose.x = x;
    pose.z = z;
    pose.rotationY = this.start.rotationY;
    pose.valid = true;
    pose.wall = null;
    this.deps.transient.publishDrag(pose);
    return true;
  }

  /**
   * Turns the object by `steps` whole steps of `stepDeg` degrees (wheel notch or `R`), re-solving
   * the pose from the last pointer position. A wall snap still decides the orientation: the turn
   * applies again once the object leaves the wall.
   */
  turnBy(steps: number, stepDeg: number): void {
    if (!this.id) return;
    this.turn += (steps * stepDeg * Math.PI) / 180;
    if (this.hasRay) this.update(this.lastRay, this.lastFree);
  }

  /**
   * One drag step (call at most once per frame). A desk top under the pointer takes the object
   * if it may stand there; otherwise it goes over the floor. `free` (Alt), like snap off in the
   * session, disables grid and wall snap.
   */
  update(ray: Ray, free: boolean): void {
    const id = this.id;
    const node = id ? this.deps.registry.get(id) : undefined;
    if (!id || !node) return;
    const { snap } = this.deps.session.getState();
    const snapping = snap.enabled && !free;
    // Always solve from the original orientation (plus the user's turn): leaving a wall turns the
    // object back.
    const turn = normalizeAngle(this.startWorldTurn + this.turn);
    let wall: DragState['wall'] = null;
    if (!this.solveOnSupport(ray, id, turn, snapping ? snap.gridStep : undefined)) {
      if (!ray.intersectPlane(floor, this.hit)) return;
      wall = this.solveOnFloor(turn, snapping, snapping ? snap.gridStep : undefined);
    }

    this.lastRay.copy(ray);
    this.lastFree = free;
    this.hasRay = true;

    // The node still hangs from where it started: express the world pose in that frame.
    const frame = this.nodeFrame;
    const world = this.world;
    roomToSupport(frame, world.x, world.z, this.scratch);
    node.position.set(this.scratch[0], (world.y - frame.y) / frame.sy, this.scratch[1]);
    node.rotation.y = normalizeAngle(world.rotationY - frame.rotationY);
    const drop = this.drop;
    this.moved ||=
      drop.parentId !== this.startParent ||
      drop.x !== this.start.x ||
      drop.z !== this.start.z ||
      drop.rotationY !== this.start.rotationY;

    const pose = this.pose;
    pose.id = id;
    pose.x = drop.x;
    pose.z = drop.z;
    pose.rotationY = drop.rotationY;
    pose.valid = drop.valid;
    pose.wall = wall;
    this.deps.transient.publishDrag(pose);
    this.deps.invalidate();
  }

  /** Ends the drag with one command; null when nothing moved. Restores the pose if refused. */
  end(): CommandResult | null {
    const id = this.id;
    if (!id) return null;
    let result: CommandResult | null = null;
    const { parentId, x, y, z, rotationY, valid } = this.drop;
    if (this.moved && !valid) this.restore(id);
    else if (this.moved) {
      const position: [number, number, number] = [x, y, z];
      result = this.deps.session.execute(
        parentId === this.startParent
          ? moveObjects([{ id, position, rotationY }])
          : reparentObject({ id, parentId, position, rotationY }),
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

  /** On a desk top under the pointer, when it may stand there and fits: true and `drop` set. */
  private solveOnSupport(ray: Ray, id: ObjectId, turn: number, gridStep: number | undefined) {
    const target = this.target;
    if (!this.toSupport || !target.find(ray, id, this.roomId, this.grab) || !target.support) {
      return false;
    }
    const input = this.onSupport;
    input.support = target.support;
    input.position[0] = target.local[0];
    input.position[1] = target.local[1];
    input.rotationY = turn - target.frame.rotationY;
    input.gridStep = gridStep;
    const result = solveOnSupport(input, this.supportResult);
    if (!result.valid) return false;
    const drop = this.drop;
    drop.parentId = target.parentId;
    drop.x = result.position[0];
    drop.y = target.support.y;
    drop.z = result.position[1];
    drop.rotationY = result.rotationY;
    drop.valid = true;
    target.toWorld(drop.x, drop.z, this.scratch);
    this.world.x = this.scratch[0];
    this.world.y = target.height;
    this.world.z = this.scratch[1];
    this.world.rotationY = target.frame.rotationY + result.rotationY;
    return true;
  }

  /** Over the floor of its room from `this.hit`: sets `drop` and returns the wall it snapped to. */
  private solveOnFloor(turn: number, snapping: boolean, gridStep: number | undefined) {
    const input = this.input;
    input.position[0] = this.hit.x - this.origin.x - this.grab[0];
    input.position[1] = this.hit.z - this.origin.z - this.grab[1];
    input.rotationY = turn;
    input.wallSnap = snapping;
    input.gridStep = gridStep;
    const result = solvePlacement(input, this.result);
    const drop = this.drop;
    drop.parentId = null;
    drop.x = result.position[0];
    // A floor object keeps its height; one coming off a desk lands on the floor.
    drop.y = this.startParent === null ? this.start.y : 0;
    drop.z = result.position[1];
    drop.rotationY = result.rotationY;
    drop.valid = result.valid && this.toFloor;
    this.world.x = this.origin.x + drop.x;
    this.world.y = drop.y;
    this.world.z = this.origin.z + drop.z;
    this.world.rotationY = drop.rotationY;
    return result.wall;
  }

  private restore(id: ObjectId) {
    const node = this.deps.registry.get(id);
    if (!node) return;
    node.position.set(this.start.x, this.start.y, this.start.z);
    node.rotation.y = this.start.rotationY;
  }

  private finish() {
    this.id = null;
    this.roomId = null;
    this.moved = false;
    this.turn = 0;
    this.hasRay = false;
    this.deps.transient.clearDrag();
    this.deps.invalidate();
  }
}
