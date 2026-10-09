import {
  addObject,
  createRoom,
  type EditorSession,
  type ObjectId,
  type RoomId,
  removeObjects,
  resizeRoom,
} from '@roomforge/core';
import type { RenderInfo, RoomDisplay, SceneCamera, SceneHandle } from '@/scene-engine';

/**
 * Test hook for Playwright (TESTING_STRATEGY §5). Only builds with `NEXT_PUBLIC_E2E=1` expose
 * `window.__RF__`; production builds never define the variable, so the hook is compiled out.
 */
export interface RoomForgeTestHook {
  /** The live editor session: tests execute commands and read state through it. */
  session: EditorSession;
  /** Command factories, so a test can run them inside the page. */
  commands: {
    createRoom: typeof createRoom;
    resizeRoom: typeof resizeRoom;
    addObject: typeof addObject;
    removeObjects: typeof removeObjects;
  };
  /** Renderer counters; `null` until the canvas is mounted. */
  info(): RenderInfo | null;
  /** Camera state and the same moves a user can make; inert until the canvas is mounted. */
  camera: SceneCamera;
  /** How a room is drawn (wall opacity and height, ceiling); `null` until it is drawn. */
  roomDisplay(roomId: RoomId): RoomDisplay | null;
  /**
   * Screen position (page pixels) of an object, to click it like a user; `null` if not drawn.
   * `local` picks another point in the object's frame (front = +z), such as the rotation knob.
   */
  project(id: ObjectId, local?: readonly [number, number, number]): { x: number; y: number } | null;
}

declare global {
  interface Window {
    __RF__?: RoomForgeTestHook;
  }
}

export const E2E_ENABLED = process.env.NEXT_PUBLIC_E2E === '1';

export function installTestHook(
  target: Window,
  deps: { session: EditorSession; getScene: () => SceneHandle | null },
  enabled: boolean = E2E_ENABLED,
): () => void {
  if (!enabled) return () => {};
  const hook: RoomForgeTestHook = {
    session: deps.session,
    commands: { createRoom, resizeRoom, addObject, removeObjects },
    info: () => deps.getScene()?.renderInfo() ?? null,
    camera: {
      fit: () => deps.getScene()?.camera.fit(),
      snapshot: () => deps.getScene()?.camera.snapshot() ?? null,
      orbit: (azimuth, polar) => deps.getScene()?.camera.orbit(azimuth, polar),
      dolly: (distance) => deps.getScene()?.camera.dolly(distance),
      setInputBlocked: (blocked) => deps.getScene()?.camera.setInputBlocked(blocked),
    },
    roomDisplay: (roomId) => deps.getScene()?.roomDisplay(roomId) ?? null,
    project: (id, local) => deps.getScene()?.project(id, local) ?? null,
  };
  target.__RF__ = hook;
  return () => {
    if (target.__RF__ === hook) delete target.__RF__;
  };
}
