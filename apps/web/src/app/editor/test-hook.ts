import {
  addObject,
  addOpening,
  createRoom,
  type EditorSession,
  type EntityId,
  moveObjects,
  moveOpening,
  type RoomId,
  removeObjects,
  removeOpenings,
  resizeRoom,
  setAllLights,
  setLight,
  setLightingMode,
  setSurfaceMaterial,
} from '@roomforge/core';
import type { Autosave, SaveState } from '@/persistence';
import type {
  DayNightInfo,
  LightPoolInfo,
  RenderInfo,
  RoomDisplay,
  SceneCamera,
  SceneHandle,
} from '@/scene-engine';

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
    moveObjects: typeof moveObjects;
    addOpening: typeof addOpening;
    moveOpening: typeof moveOpening;
    removeOpenings: typeof removeOpenings;
    setSurfaceMaterial: typeof setSurfaceMaterial;
    setLight: typeof setLight;
    setAllLights: typeof setAllLights;
    setLightingMode: typeof setLightingMode;
  };
  /** Renderer counters; `null` until the canvas is mounted. */
  info(): RenderInfo | null;
  /** The light pool (size, luminaires lit) and the scene's light count; `null` until mounted. */
  lights(): (LightPoolInfo & { sceneLights: number }) | null;
  /** Day or night as drawn (mode, level 0–1, transition); `null` until mounted. */
  dayNight(): DayNightInfo | null;
  /** Redraws of the sun's static shadow map asked for so far; `null` until mounted. */
  shadowRefreshes(): number | null;
  /** Asks the canvas for one frame (e.g. to read the counters of a frame without shadow pass). */
  invalidate(): void;
  /** Camera state and the same moves a user can make; inert until the canvas is mounted. */
  camera: SceneCamera;
  /** How a room is drawn (wall opacity and height, ceiling); `null` until it is drawn. */
  roomDisplay(roomId: RoomId): RoomDisplay | null;
  /**
   * Screen position (page pixels) of an object or opening, to click it like a user; `null` if not
   * drawn. `local` picks another point in its frame (an object's front is +z; an opening's origin
   * is the bottom centre of its hole), such as the rotation knob.
   */
  project(id: EntityId, local?: readonly [number, number, number]): { x: number; y: number } | null;
  /** Autosave: where the work stands, and writing it now. Both inert until it is running. */
  autosave: { state(): SaveState | null; flush(): Promise<void> };
}

declare global {
  interface Window {
    __RF__?: RoomForgeTestHook;
  }
}

export const E2E_ENABLED = process.env.NEXT_PUBLIC_E2E === '1';

export function installTestHook(
  target: Window,
  deps: {
    session: EditorSession;
    getScene: () => SceneHandle | null;
    getAutosave?: () => Autosave | null;
  },
  enabled: boolean = E2E_ENABLED,
): () => void {
  if (!enabled) return () => {};
  const hook: RoomForgeTestHook = {
    session: deps.session,
    commands: {
      createRoom,
      resizeRoom,
      addObject,
      removeObjects,
      moveObjects,
      addOpening,
      moveOpening,
      removeOpenings,
      setSurfaceMaterial,
      setLight,
      setAllLights,
      setLightingMode,
    },
    info: () => deps.getScene()?.renderInfo() ?? null,
    lights: () => deps.getScene()?.lights() ?? null,
    dayNight: () => deps.getScene()?.dayNight() ?? null,
    shadowRefreshes: () => deps.getScene()?.shadowRefreshes() ?? null,
    invalidate: () => deps.getScene()?.invalidate(),
    camera: {
      fit: () => deps.getScene()?.camera.fit(),
      snapshot: () => deps.getScene()?.camera.snapshot() ?? null,
      orbit: (azimuth, polar) => deps.getScene()?.camera.orbit(azimuth, polar),
      dolly: (distance) => deps.getScene()?.camera.dolly(distance),
      setInputBlocked: (blocked) => deps.getScene()?.camera.setInputBlocked(blocked),
    },
    roomDisplay: (roomId) => deps.getScene()?.roomDisplay(roomId) ?? null,
    project: (id, local) => deps.getScene()?.project(id, local) ?? null,
    autosave: {
      state: () => deps.getAutosave?.()?.state() ?? null,
      flush: async () => void (await deps.getAutosave?.()?.flush()),
    },
  };
  target.__RF__ = hook;
  return () => {
    if (target.__RF__ === hook) delete target.__RF__;
  };
}
