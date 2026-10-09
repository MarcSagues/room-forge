import type { ObjectId, WallId } from '@roomforge/core';

/** The pose of the object being dragged, in room-local metres. */
export interface DragState {
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
  /** Centre on the floor, in world metres (the room origin already added). */
  x: number;
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
  subscribe(listener: () => void): () => void;
}

export function createTransientStore(): TransientStore {
  const shared: DragState = {
    id: '' as ObjectId,
    x: 0,
    z: 0,
    rotationY: 0,
    valid: true,
    wall: null,
  };
  const sharedGhost: GhostState = {
    x: 0,
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
  let active = false;
  let ghostActive = false;
  // Replaced (not mutated) on subscribe and unsubscribe, so notifying is a plain indexed loop.
  let listeners: readonly (() => void)[] = [];
  const notify = () => {
    const current = listeners;
    for (let i = 0; i < current.length; i += 1) (current[i] as () => void)();
  };
  return {
    drag: () => (active ? shared : null),
    publishDrag(state) {
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
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((other) => other !== listener);
      };
    },
  };
}
