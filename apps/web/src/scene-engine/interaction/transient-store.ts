import type { ObjectId, WallId } from '@roomforge/core';

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
    kind: 'move',
    id: '' as ObjectId,
    x: 0,
    z: 0,
    rotationY: 0,
    valid: true,
    wall: null,
  };
  let active = false;
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
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((other) => other !== listener);
      };
    },
  };
}
