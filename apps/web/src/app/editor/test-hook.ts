import { createRoom, type EditorSession, resizeRoom } from '@roomforge/core';
import type { RenderInfo, SceneCamera, SceneHandle } from '@/scene-engine';

/**
 * Test hook for Playwright (TESTING_STRATEGY §5). Only builds with `NEXT_PUBLIC_E2E=1` expose
 * `window.__RF__`; production builds never define the variable, so the hook is compiled out.
 */
export interface RoomForgeTestHook {
  /** The live editor session: tests execute commands and read state through it. */
  session: EditorSession;
  /** Command factories, so a test can run them inside the page. */
  commands: { createRoom: typeof createRoom; resizeRoom: typeof resizeRoom };
  /** Renderer counters; `null` until the canvas is mounted. */
  info(): RenderInfo | null;
  /** Camera state and the same moves a user can make; inert until the canvas is mounted. */
  camera: SceneCamera;
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
    commands: { createRoom, resizeRoom },
    info: () => deps.getScene()?.renderInfo() ?? null,
    camera: {
      fit: () => deps.getScene()?.camera.fit(),
      snapshot: () => deps.getScene()?.camera.snapshot() ?? null,
      orbit: (azimuth, polar) => deps.getScene()?.camera.orbit(azimuth, polar),
      dolly: (distance) => deps.getScene()?.camera.dolly(distance),
    },
  };
  target.__RF__ = hook;
  return () => {
    if (target.__RF__ === hook) delete target.__RF__;
  };
}
