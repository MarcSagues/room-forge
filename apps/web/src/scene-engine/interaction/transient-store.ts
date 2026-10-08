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
  let active = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
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
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
