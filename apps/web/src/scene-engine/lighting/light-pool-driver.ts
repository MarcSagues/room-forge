import {
  allocateLights,
  type CatalogProvider,
  collectLuminaires,
  type EditorSession,
  emptyAllocation,
  type LightAllocation,
  type LightPoolSize,
} from '@roomforge/core';
import { type Camera, Vector3 } from 'three';
import { applyAllocation, type LightPool, type LightPoolInfo } from './light-pool';

/** How far the camera must travel, or turn, before the lights are dealt out again. */
const MOVE_METRES = 0.5;
const TURN_COS = Math.cos((12 * Math.PI) / 180);
/** Reallocations while the camera keeps moving happen at most this often (ms). */
const SETTLE_MS = 200;

export interface LightPoolDriverDeps {
  session: EditorSession;
  catalog: CatalogProvider;
  pool: LightPool;
  size: LightPoolSize;
  /** Asks for a frame after the lights changed outside React (rule 4). */
  invalidate: () => void;
}

export interface LightPoolDriver {
  /**
   * Called on every rendered frame with the active camera. Allocation-free: it only compares the
   * camera with where it was at the last allocation, and schedules a new one once it moved enough.
   */
  watch(camera: Camera): void;
  allocation(): LightAllocation;
  info(): LightPoolInfo;
  dispose(): void;
}

/**
 * Keeps the light pool in step with the scene (P5-05): it deals the pool's lights out to the
 * luminaires when the document or the selection changes, and when the camera has moved enough
 * (never on every frame), then mutates the lights in place and asks for a frame.
 */
export function createLightPoolDriver(deps: LightPoolDriverDeps): LightPoolDriver {
  const { session, catalog, pool, size, invalidate } = deps;
  let allocation = emptyAllocation(size);
  let camera: Camera | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Where the camera was and looked at the last allocation, and a scratch vector to compare.
  const eye = new Vector3();
  const look = new Vector3();
  const probe = new Vector3();

  /**
   * `inFrame`: called while a frame is being drawn, which shows the change without asking.
   * `onlyIfChanged`: the scene is as it was (the camera moved), so the same lights need nothing.
   */
  function allocate(inFrame = false, onlyIfChanged = false): void {
    if (!camera) return;
    camera.getWorldPosition(eye);
    camera.getWorldDirection(look);
    const { document, selection } = session.store.getState();
    const luminaires = collectLuminaires(document, catalog, selection);
    const next = allocateLights(
      luminaires,
      { position: [eye.x, eye.y, eye.z], direction: [look.x, look.y, look.z] },
      size,
      allocation,
    );
    if (onlyIfChanged && sameAllocation(next, allocation)) return;
    allocation = next;
    applyAllocation(pool, allocation, new Map(luminaires.map((item) => [item.id, item])));
    // Asking for a frame from inside one would draw a second, needless frame.
    if (!inFrame) invalidate();
  }

  const settle = () => {
    timer = null;
    allocate(false, true);
  };

  const unsubscribe = session.store.subscribe((state, previous) => {
    if (state.document !== previous.document || state.selection !== previous.selection) {
      allocate();
    }
  });

  return {
    watch(next) {
      if (next !== camera) {
        camera = next;
        allocate(true);
        return;
      }
      if (timer !== null) return;
      next.getWorldPosition(probe);
      const moved = probe.distanceToSquared(eye) > MOVE_METRES * MOVE_METRES;
      if (moved || next.getWorldDirection(probe).dot(look) < TURN_COS) {
        timer = setTimeout(settle, SETTLE_MS);
      }
    },
    allocation: () => allocation,
    info: () => ({
      points: pool.points.length,
      spots: pool.spots.length,
      lit: [...allocation.point, ...allocation.spot].filter(
        (id): id is NonNullable<typeof id> => id !== null,
      ),
    }),
    dispose() {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
      timer = null;
      camera = null;
    },
  };
}

const sameSlots = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

function sameAllocation(a: LightAllocation, b: LightAllocation): boolean {
  return sameSlots(a.point, b.point) && sameSlots(a.spot, b.spot);
}
