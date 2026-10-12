import type { ObjectId, OpeningId, RoomId, WallId } from '@roomforge/core';

/** What the gesture does: move the object over the floor, or turn it with the rotation handle. */
export type DragKind = 'move' | 'rotate';

/** The pose of the object being dragged, in room-local metres. */
export interface DragState {
  kind: DragKind;
  id: ObjectId;
  x: number;
  z: number;
  rotationY: number;
  /** False when the pose could not be made legal (the drop would be rejected). */
  valid: boolean;
  /** Wall the object is snapped to, for guides. */
  wall: WallId | null;
}

/** The ghost of an item being dragged in from the catalog: where it would land if dropped. */
export interface GhostState {
  /** Centre of its base, in world metres (the room origin already added); y > 0 on a desk. */
  x: number;
  y: number;
  z: number;
  rotationY: number;
  /** Size of the item, in metres. */
  w: number;
  h: number;
  d: number;
  /** False when it cannot be placed there (a drop would create nothing). */
  valid: boolean;
  /** False while the pointer is not over a room's floor: nothing is drawn. */
  visible: boolean;
  /** Wall the ghost is snapped to, for guides. */
  wall: WallId | null;
  /** Colour of the item's placeholder box, when the catalog has one. */
  color: string | null;
}

/** A door or window being slid along its wall, or dragged in from the catalog. */
export interface OpeningDragState {
  /** The opening being slid, or null for a new one being placed. */
  id: OpeningId | null;
  roomId: RoomId;
  wall: WallId;
  kind: 'door' | 'window';
  variant: string;
  /** Where its hole starts along the wall, in metres (DOMAIN_MODEL `Opening.offset`). */
  offset: number;
  width: number;
  height: number;
  sill: number;
  /** False when it does not fit there (the drop would be refused). */
  valid: boolean;
  /** False while a new opening is not over a wall: nothing is drawn. */
  visible: boolean;
}

/**
 * Per-frame interaction state that must not go through React or the document (ARCHITECTURE §4.2):
 * the drag controller writes it at most once per frame, readers (outline, camera rig, a future
 * coordinates readout) subscribe. Mutated in place: publishing allocates nothing.
 */
export interface TransientStore {
  /** The current drag, or null. Do not keep the object: it is reused. */
  drag(): Readonly<DragState> | null;
  /** Starts or updates the drag (fields copied into the shared object) and notifies. */
  publishDrag(state: Readonly<DragState>): void;
  clearDrag(): void;
  /** The placement ghost, or null. Do not keep the object: it is reused. */
  ghost(): Readonly<GhostState> | null;
  publishGhost(state: Readonly<GhostState>): void;
  clearGhost(): void;
  /** The opening being dragged, or null. Do not keep the object: it is reused. */
  opening(): Readonly<OpeningDragState> | null;
  publishOpening(state: Readonly<OpeningDragState>): void;
  clearOpening(): void;
  subscribe(listener: () => void): () => void;
}

export function createTransientStore(): TransientStore {
  const shared: DragState = {
    kind: 'move',
    id: '' as ObjectId,
    x: 0,
    z: 0,
    rotationY: 0,
    valid: true,
    wall: null,
  };
  const sharedGhost: GhostState = {
    x: 0,
    y: 0,
    z: 0,
    rotationY: 0,
    w: 0,
    h: 0,
    d: 0,
    valid: true,
    visible: false,
    wall: null,
    color: null,
  };
  const sharedOpening: OpeningDragState = {
    id: null,
    roomId: '' as RoomId,
    wall: 'north',
    kind: 'door',
    variant: '',
    offset: 0,
    width: 0,
    height: 0,
    sill: 0,
    valid: true,
    visible: false,
  };
  let active = false;
  let ghostActive = false;
  let openingActive = false;
  // Replaced (not mutated) on subscribe and unsubscribe, so notifying is a plain indexed loop.
  let listeners: readonly (() => void)[] = [];
  const notify = () => {
    const current = listeners;
    for (let i = 0; i < current.length; i += 1) (current[i] as () => void)();
  };
  return {
    drag: () => (active ? shared : null),
    publishDrag(state) {
      shared.kind = state.kind;
      shared.id = state.id;
      shared.x = state.x;
      shared.z = state.z;
      shared.rotationY = state.rotationY;
      shared.valid = state.valid;
      shared.wall = state.wall;
      active = true;
      notify();
    },
    clearDrag() {
      if (!active) return;
      active = false;
      notify();
    },
    ghost: () => (ghostActive ? sharedGhost : null),
    publishGhost(state) {
      sharedGhost.x = state.x;
      sharedGhost.y = state.y;
      sharedGhost.z = state.z;
      sharedGhost.rotationY = state.rotationY;
      sharedGhost.w = state.w;
      sharedGhost.h = state.h;
      sharedGhost.d = state.d;
      sharedGhost.valid = state.valid;
      sharedGhost.visible = state.visible;
      sharedGhost.wall = state.wall;
      sharedGhost.color = state.color;
      ghostActive = true;
      notify();
    },
    clearGhost() {
      if (!ghostActive) return;
      ghostActive = false;
      notify();
    },
    opening: () => (openingActive ? sharedOpening : null),
    publishOpening(state) {
      sharedOpening.id = state.id;
      sharedOpening.roomId = state.roomId;
      sharedOpening.wall = state.wall;
      sharedOpening.kind = state.kind;
      sharedOpening.variant = state.variant;
      sharedOpening.offset = state.offset;
      sharedOpening.width = state.width;
      sharedOpening.height = state.height;
      sharedOpening.sill = state.sill;
      sharedOpening.valid = state.valid;
      sharedOpening.visible = state.visible;
      openingActive = true;
      notify();
    },
    clearOpening() {
      if (!openingActive) return;
      openingActive = false;
      notify();
    },
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((other) => other !== listener);
      };
    },
  };
}
