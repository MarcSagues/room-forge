import {
  type CommandResult,
  type EditorSession,
  intersectRayWall,
  moveOpening,
  type OpeningId,
  type OpeningOffsetInput,
  type OpeningOffsetResult,
  type RoomId,
  solveOpeningOffset,
  type WallHit,
  type WallId,
  wallLength,
  wallU,
} from '@roomforge/core';
import type { Ray } from 'three';
import type { EntityRegistry } from '../objects/entity-registry';
import { WALL_THICKNESS } from '../room/room-geometry';
import type { OpeningDragState, TransientStore } from './transient-store';

export interface OpeningControllerDeps {
  session: EditorSession;
  registry: EntityRegistry;
  transient: TransientStore;
  /** Requests a frame (`frameloop="demand"`). */
  invalidate(): void;
}

/** Room as the session hands it out: part of the frozen document, never modified here. */
type Room = NonNullable<ReturnType<EditorSession['getState']>['document']['rooms'][RoomId]>;

/** Where the interior starts along a wall's frame: north/south frames cover the corners. */
export const wallShift = (wall: WallId) =>
  wall === 'north' || wall === 'south' ? WALL_THICKNESS : 0;

/**
 * Slides a door or window along its wall (P3-12), with the drag pattern of `MoveController`: while
 * the pointer moves, the opening's anchor is moved and its pose published to the transient store
 * (the wall redraws its hole and fittings from there, see `LiveWall`); the document changes once,
 * on release, with one `opening/move` (one history entry). Esc puts it back. The offset follows
 * the commands' policy (`solveOpeningOffset`): snapped along the wall, clear of the corners, and
 * flagged invalid where it would overlap another opening, in which case the drop is refused.
 * Every per-step object is reused: no allocations on the hot path.
 */
export class OpeningController {
  private readonly deps: OpeningControllerDeps;
  private id: OpeningId | null = null;
  private room: Room | null = null;
  private startOffset = 0;
  /** Offset of the grabbed point from the opening's starting edge, along the wall. */
  private grab = 0;
  private moved = false;
  private readonly origin: [number, number, number] = [0, 0, 0];
  private readonly direction: [number, number, number] = [0, 0, 0];
  private readonly hit: WallHit = { wall: 'north', u: 0, v: 0, t: 0 };
  private readonly others: { offset: number; width: number }[] = [];
  private readonly input: OpeningOffsetInput & { others: { offset: number; width: number }[] };
  private readonly result: OpeningOffsetResult = { offset: 0, valid: true, reason: null };
  private readonly pose: OpeningDragState = {
    id: null,
    roomId: '' as OpeningDragState['roomId'],
    wall: 'north',
    kind: 'door',
    variant: '',
    offset: 0,
    width: 0,
    height: 0,
    sill: 0,
    valid: true,
    visible: true,
  };

  constructor(deps: OpeningControllerDeps) {
    this.deps = deps;
    for (let i = 0; i < 8; i += 1) this.others.push({ offset: 0, width: 0 });
    this.input = {
      length: 0,
      roomHeight: 0,
      width: 0,
      height: 0,
      sill: 0,
      offset: 0,
      others: this.others,
      othersCount: 0,
    };
  }

  get active(): boolean {
    return this.id !== null;
  }

  /** Starts sliding `id` from where `ray` meets its wall; false if it cannot be grabbed there. */
  begin(id: OpeningId, ray: Ray): boolean {
    const { document } = this.deps.session.getState();
    const opening = document.openings[id];
    const room = opening ? document.rooms[opening.roomId] : undefined;
    if (!opening || !room || !this.deps.registry.get(id)) return false;
    this.room = room;
    if (!this.wallHit(ray, opening.wall)) return false;

    this.id = id;
    this.moved = false;
    this.startOffset = opening.offset;
    this.grab = this.hit.u - opening.offset;
    const input = this.input;
    input.length = wallLength(room.shape, opening.wall);
    input.roomHeight = room.height;
    input.width = opening.width;
    input.height = opening.height;
    input.sill = opening.sill;
    let count = 0;
    for (const other of Object.values(document.openings)) {
      if (other.id === id || other.roomId !== room.id || other.wall !== opening.wall) continue;
      const slot = this.others[count];
      if (!slot) break;
      slot.offset = other.offset;
      slot.width = other.width;
      count += 1;
    }
    input.othersCount = count;
    this.result.offset = opening.offset;
    this.result.valid = true;

    const pose = this.pose;
    pose.id = id;
    pose.roomId = opening.roomId;
    pose.wall = opening.wall;
    pose.kind = opening.kind;
    pose.variant = opening.variant;
    pose.offset = opening.offset;
    pose.width = opening.width;
    pose.height = opening.height;
    pose.sill = opening.sill;
    pose.valid = true;
    pose.visible = true;
    this.deps.transient.publishOpening(pose);
    this.deps.invalidate();
    return true;
  }

  /** One drag step (at most once per frame); `free` (Alt), like snap off, disables the grid. */
  update(ray: Ray, free: boolean): void {
    const id = this.id;
    const node = id ? this.deps.registry.get(id) : undefined;
    if (!id || !node || !this.wallHit(ray, this.pose.wall)) return;
    const { snap } = this.deps.session.getState();
    this.input.offset = this.hit.u - this.grab;
    this.input.gridStep = snap.enabled && !free ? snap.gridStep : undefined;
    const result = solveOpeningOffset(this.input, this.result);
    node.position.x = wallShift(this.pose.wall) + result.offset + this.pose.width / 2;
    this.moved ||= result.offset !== this.startOffset;
    this.pose.offset = result.offset;
    this.pose.valid = result.valid;
    this.deps.transient.publishOpening(this.pose);
    this.deps.invalidate();
  }

  /** Ends the slide with one `opening/move`; null when nothing moved or the drop was refused. */
  end(): CommandResult | null {
    const id = this.id;
    if (!id) return null;
    let result: CommandResult | null = null;
    if (this.moved && this.result.valid) {
      result = this.deps.session.execute(moveOpening(id, { offset: this.result.offset }));
    }
    if (!result?.ok) this.restore(id);
    this.finish();
    return result;
  }

  /** Abandons the slide (Esc): the opening goes back, nothing is recorded. */
  cancel(): void {
    if (this.id) this.restore(this.id);
    this.finish();
  }

  /** Where the ray meets `wall`'s plane (either side), in room coordinates, into `hit`. */
  private wallHit(ray: Ray, wall: WallId): boolean {
    const room = this.room;
    if (!room) return false;
    this.origin[0] = ray.origin.x - room.origin[0];
    this.origin[1] = ray.origin.y;
    this.origin[2] = ray.origin.z - room.origin[1];
    this.direction[0] = ray.direction.x;
    this.direction[1] = ray.direction.y;
    this.direction[2] = ray.direction.z;
    if (intersectRayWall(room.shape, wall, this.origin, this.direction, false, this.hit))
      return true;
    // Looking straight down (plan view) the ray runs along the wall: use the floor point instead.
    const dy = this.direction[1];
    if (dy >= -1e-9) return false;
    const t = -this.origin[1] / dy;
    const x = this.origin[0] + this.direction[0] * t;
    const z = this.origin[2] + this.direction[2] * t;
    this.hit.wall = wall;
    this.hit.u = wallU(room.shape, wall, x, z);
    this.hit.v = 0;
    this.hit.t = t;
    return true;
  }

  private restore(id: OpeningId) {
    const node = this.deps.registry.get(id);
    if (node) node.position.x = wallShift(this.pose.wall) + this.startOffset + this.pose.width / 2;
  }

  private finish() {
    this.id = null;
    this.room = null;
    this.moved = false;
    this.deps.transient.clearOpening();
    this.deps.invalidate();
  }
}
