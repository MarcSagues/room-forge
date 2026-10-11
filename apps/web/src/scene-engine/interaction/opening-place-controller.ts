import {
  addOpening,
  type CommandResult,
  type EditorSession,
  LIMITS,
  OPENING_VARIANTS,
  type OpeningId,
  type OpeningOffsetInput,
  type OpeningOffsetResult,
  type OpeningVariant,
  pickWall,
  type RoomId,
  solveOpeningOffset,
  WALL_IDS,
  type WallHit,
  type WallId,
  wallLength,
} from '@roomforge/core';
import type { Ray } from 'three';
import type { PlacementTarget } from './placement-api';
import type { OpeningDragState, TransientStore } from './transient-store';

export interface OpeningPlaceControllerDeps {
  session: EditorSession;
  transient: TransientStore;
  /** Requests a frame (`frameloop="demand"`). */
  invalidate(): void;
}

type Room = NonNullable<ReturnType<EditorSession['getState']>['document']['rooms'][RoomId]>;

/**
 * Places a door or window dragged in from the catalog's Structure tab (P3-12). The pointer picks
 * the wall it points at (`pickWall`: the interior faces seen from inside the room, so the faded
 * near walls are skipped); the opening is centred on the pointer along that wall and solved with
 * the commands' policy. The pose goes to the transient store, where the wall draws the hole, the
 * fittings and an outline (red where it does not fit), all live. Releasing over a wall where it
 * fits creates it with one `opening/add` and selects it; anywhere else creates nothing. Every
 * per-step object is reused: no allocations on the hot path.
 */
export class OpeningPlaceController implements PlacementTarget {
  private readonly deps: OpeningPlaceControllerDeps;
  private active = false;
  private readonly origin: [number, number, number] = [0, 0, 0];
  private readonly direction: [number, number, number] = [0, 0, 0];
  private readonly hit: WallHit = { wall: 'north', u: 0, v: 0, t: 0 };
  private readonly best: WallHit = { wall: 'north', u: 0, v: 0, t: 0 };
  private readonly box = { width: 0, depth: 0, height: 0 };
  private readonly others: { offset: number; width: number }[] = [];
  private readonly input: OpeningOffsetInput & { others: { offset: number; width: number }[] };
  private readonly result: OpeningOffsetResult = { offset: 0, valid: false, reason: null };
  private readonly pose: OpeningDragState = {
    id: null,
    roomId: '' as RoomId,
    wall: 'north',
    kind: 'door',
    variant: '',
    offset: 0,
    width: 0,
    height: 0,
    sill: 0,
    valid: false,
    visible: false,
  };

  constructor(deps: OpeningPlaceControllerDeps) {
    this.deps = deps;
    for (let i = 0; i < LIMITS.maxOpeningsPerWall; i += 1)
      this.others.push({ offset: 0, width: 0 });
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

  /** Starts dragging a variant of `OPENING_VARIANTS` in; false when unknown or there is no room. */
  begin(variant: string): boolean {
    if (!Object.hasOwn(OPENING_VARIANTS, variant)) return false;
    if (this.deps.session.getState().document.roomOrder.length === 0) return false;
    const size = OPENING_VARIANTS[variant as OpeningVariant];
    const pose = this.pose;
    pose.kind = size.kind;
    pose.variant = variant;
    pose.width = size.width;
    pose.height = size.height;
    pose.sill = size.sill;
    pose.visible = false;
    pose.valid = false;
    this.input.width = size.width;
    this.input.height = size.height;
    this.input.sill = size.sill;
    this.active = true;
    this.deps.transient.publishOpening(pose);
    this.deps.invalidate();
    return true;
  }

  /** One step (at most once per frame); `ray` is null outside the viewport, `free` = Alt. */
  update(ray: Ray | null, free: boolean): void {
    if (!this.active) return;
    const room = ray ? this.wallUnder(ray) : null;
    if (room) {
      const { snap } = this.deps.session.getState();
      this.solve(room, this.best.wall, this.best.u - this.pose.width / 2, snap.enabled && !free);
    } else {
      this.pose.visible = false;
      this.pose.valid = false;
    }
    this.deps.transient.publishOpening(this.pose);
    this.deps.invalidate();
  }

  /** Drops it where it is: one `opening/add` when it fits on a wall, otherwise nothing. */
  end(): CommandResult | null {
    let result: CommandResult | null = null;
    if (this.active && this.pose.visible && this.pose.valid) result = this.create();
    this.finish();
    return result;
  }

  cancel(): void {
    this.finish();
  }

  /**
   * Click or Enter on a variant: on the wall the centre of the view looks at, or else centred on
   * the first wall of the first room where it fits.
   */
  placeAtCenter(variant: string, ray: Ray | null): CommandResult | null {
    if (!this.begin(variant)) return null;
    this.update(ray, false);
    if (!(this.pose.visible && this.pose.valid)) {
      const { document } = this.deps.session.getState();
      const room = document.rooms[document.roomOrder[0] as RoomId];
      for (const wall of WALL_IDS) {
        if (!room) break;
        const centred = (wallLength(room.shape, wall) - this.pose.width) / 2;
        if (this.solve(room, wall, centred, false)) break;
      }
    }
    return this.end();
  }

  /** The nearest wall the ray designates over every room, into `best`; its room or null. */
  private wallUnder(ray: Ray): Room | null {
    const { document } = this.deps.session.getState();
    let found: Room | null = null;
    for (let i = 0; i < document.roomOrder.length; i += 1) {
      const room = document.rooms[document.roomOrder[i] as RoomId];
      if (!room) continue;
      this.origin[0] = ray.origin.x - room.origin[0];
      this.origin[1] = ray.origin.y;
      this.origin[2] = ray.origin.z - room.origin[1];
      this.direction[0] = ray.direction.x;
      this.direction[1] = ray.direction.y;
      this.direction[2] = ray.direction.z;
      this.box.width = room.shape.width;
      this.box.depth = room.shape.depth;
      this.box.height = room.height;
      if (!pickWall(this.box, this.origin, this.direction, this.hit)) continue;
      if (found && this.hit.t >= this.best.t) continue;
      found = room;
      this.best.wall = this.hit.wall;
      this.best.u = this.hit.u;
      this.best.t = this.hit.t;
    }
    return found;
  }

  /** Solves the pose on `wall` of `room` for a wanted offset; returns whether it fits. */
  private solve(room: Room, wall: WallId, offset: number, snapping: boolean): boolean {
    const input = this.input;
    input.length = wallLength(room.shape, wall);
    input.roomHeight = room.height;
    input.offset = offset;
    input.gridStep = snapping ? this.deps.session.getState().snap.gridStep : undefined;
    let count = 0;
    const { openings } = this.deps.session.getState().document;
    for (const id in openings) {
      const other = openings[id as OpeningId];
      if (!other || other.roomId !== room.id || other.wall !== wall) continue;
      const slot = this.others[count];
      if (slot) {
        slot.offset = other.offset;
        slot.width = other.width;
      }
      count += 1;
    }
    input.othersCount = Math.min(count, this.others.length);
    const result = solveOpeningOffset(input, this.result);
    const pose = this.pose;
    pose.roomId = room.id;
    pose.wall = wall;
    pose.offset = result.offset;
    pose.valid = result.valid && count < LIMITS.maxOpeningsPerWall;
    pose.visible = true;
    return pose.valid;
  }

  private create(): CommandResult {
    const { session } = this.deps;
    const before = session.getState().document.openings;
    const pose = this.pose;
    const result = session.execute(
      addOpening({
        roomId: pose.roomId,
        wall: pose.wall,
        variant: pose.variant,
        offset: pose.offset,
      }),
    );
    if (result.ok) {
      const after = session.getState().document.openings;
      const created = Object.keys(after).find((id) => !Object.hasOwn(before, id));
      if (created) session.select([created as OpeningId], 'replace');
    }
    return result;
  }

  private finish() {
    this.active = false;
    this.deps.transient.clearOpening();
    this.deps.invalidate();
  }
}
