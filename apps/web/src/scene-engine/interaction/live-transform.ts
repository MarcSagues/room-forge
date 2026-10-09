import type { TransientStore } from './transient-store';

/**
 * The pose of the object being dragged or turned in the scene, in room-local metres and radians,
 * for readouts outside the canvas (the properties panel). The object `read` returns is reused:
 * read it, do not keep it.
 */
export interface LiveTransform {
  read(): {
    readonly id: string;
    readonly x: number;
    readonly z: number;
    readonly rotationY: number;
  } | null;
  /** Called whenever the pose changes (at most once per frame) and when the drag ends. */
  subscribe(listener: () => void): () => void;
}

export function liveTransformOf(transient: TransientStore): LiveTransform {
  return { read: () => transient.drag(), subscribe: (listener) => transient.subscribe(listener) };
}
