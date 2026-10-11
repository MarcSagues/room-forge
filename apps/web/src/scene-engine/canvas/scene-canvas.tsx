'use client';

import { addAfterEffect, Canvas, useThree } from '@react-three/fiber';
import {
  type EditorSession,
  type EntityId,
  type LightQuality,
  type RoomId,
  WALL_IDS,
  type WallId,
} from '@roomforge/core';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Light,
  type Material,
  type Mesh,
  NeutralToneMapping,
  type Object3D,
  Vector3,
} from 'three';
import type { CameraHandle, CameraSnapshot } from '../camera/camera-director';
import { CameraRig } from '../camera/camera-rig';
import { type LiveTransform, liveTransformOf } from '../interaction/live-transform';
import { OpeningPlaceController } from '../interaction/opening-place-controller';
import { PlaceController } from '../interaction/place-controller';
import { createPlacementApi, type PlacementApi } from '../interaction/placement-api';
import { createTransientStore } from '../interaction/transient-store';
import type { LightPoolInfo } from '../lighting/light-pool';
import type { LightPoolDriver } from '../lighting/light-pool-driver';
import { MaterialsProvider } from '../materials/materials-context';
import { createEntityRegistry, type EntityRegistry } from '../objects/entity-registry';
import { ModelsProvider } from '../resources/models-context';
import { roomObjectName } from '../room/room-mesh';
import { watchContext } from './context-events';
import { detectGraphicsProfile } from './graphics-profile';
import { connectInvalidate } from './invalidate-bridge';
import { createMutate, type Mutate } from './mutate';
import { formatRenderInfo, type RenderInfo, readRenderInfo } from './render-info';
import { SceneContent } from './scene-content';
import {
  type SceneCatalog,
  SceneSessionProvider,
  useSceneCatalog,
  useSceneSession,
  useTransientStore,
} from './scene-context';

/** The camera as the host sees it; `snapshot` is null until the rig is mounted. */
export interface SceneCamera extends Omit<CameraHandle, 'snapshot'> {
  snapshot(): CameraSnapshot | null;
}

/** How a room is drawn right now (wall opacity, wall height scale, ceiling), read from the scene. */
export interface RoomDisplay {
  wallOpacity: Record<WallId, number>;
  wallHeightScale: number;
  ceilingVisible: boolean;
}

/** What the host (app, E2E hook) can do with a mounted scene. */
export interface SceneHandle {
  /** `null` when the room is not drawn. */
  roomDisplay(roomId: RoomId): RoomDisplay | null;
  /**
   * Where an object's centre appears on screen, in page pixels (`clientX/Y`); `null` if it is not
   * drawn or is behind the camera. Lets tests and tools click objects like a user would.
   * `local` picks another point, in the object's own frame (its front is +z), e.g. the knob of
   * the rotation handle.
   */
  project(id: EntityId, local?: readonly [number, number, number]): { x: number; y: number } | null;
  /** Renderer counters (frame, draw calls, triangles, programs...). */
  renderInfo(): RenderInfo;
  /**
   * The light pool (how many lights of each type, which luminaires have one now) and how many
   * three.js lights the whole scene has, which must never change (ADR-0006).
   */
  lights(): LightPoolInfo & { sceneLights: number };
  /** Run a direct three.js mutation and request a frame. */
  mutate: Mutate;
  invalidate(): void;
  camera: SceneCamera;
  /** Dragging an item in from the catalog panel, or placing it in the middle of the view. */
  placement: PlacementApi;
  /** The same for doors and windows (ids are `OPENING_VARIANTS` keys): they go on a wall. */
  openingPlacement: PlacementApi;
  /** The pose of the object being dragged, for readouts outside the canvas. */
  live: LiveTransform;
}

export interface SceneCanvasProps {
  session: EditorSession;
  /** Object sizes for placeholders and picking; unknown ids draw as placeholder boxes. */
  catalog?: SceneCatalog;
  onReady?: (handle: SceneHandle) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  /** Dev overlay with renderer counters. Defaults to on outside production builds. */
  showStats?: boolean;
  /**
   * Graphics quality: the size of the light pool (P5-05). Defaults to the device's profile: low on
   * phones and tablets, medium elsewhere until P5-10.
   */
  quality?: LightQuality;
  /**
   * Look, do not touch (P7-06): taps and clicks neither select, hover nor drag; the camera still
   * moves. For a shared link's viewer and the editor on a phone.
   */
  viewOnly?: boolean;
}

const showStatsByDefault = process.env.NODE_ENV !== 'production';

/**
 * The R3F canvas. `frameloop="demand"`: with nothing changing it renders zero frames (ADR-0006).
 * Anything that changes the picture must call `invalidate()`; the session bridge does it for
 * document and selection changes, and `mutate()` does it for direct three.js mutations.
 */
export function SceneCanvas(props: SceneCanvasProps) {
  const {
    session,
    catalog,
    onReady,
    onContextLost,
    onContextRestored,
    showStats = showStatsByDefault,
    viewOnly = false,
  } = props;
  // Read once: the kind of device does not change while the page is open.
  const [profile] = useState(() =>
    detectGraphicsProfile(typeof window === 'undefined' ? undefined : window.matchMedia),
  );
  const quality = props.quality ?? profile.quality;
  const viewOnlyRef = useRef(viewOnly);
  viewOnlyRef.current = viewOnly;
  const statsRef = useRef<HTMLPreElement>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const lightPoolRef = useRef<LightPoolDriver | null>(null);
  const registry = useMemo(() => createEntityRegistry(), []);
  const transient = useMemo(() => createTransientStore(), []);
  return (
    // `touch-none` here, not only on the canvas: camera-controls clears the canvas's touch-action
    // whenever one of the two controls is disabled (always one, both during a view switch), and
    // then a finger would scroll or zoom the page instead of moving the camera.
    <div className="relative size-full touch-none select-none">
      {/* The camera rig owns the cameras (R3F's default one is replaced as soon as it mounts). */}
      <Canvas
        frameloop="demand"
        dpr={[1, profile.maxDpr]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping;
        }}
      >
        <SceneSessionProvider
          session={session}
          transient={transient}
          {...(catalog ? { catalog } : {})}
        >
          <SessionBridge />
          <ViewOnlyGuard viewOnly={viewOnly} />
          <ContextWatcher onLost={onContextLost} onRestored={onContextRestored} />
          <CameraRig handleRef={cameraRef} />
          <ReadyReporter
            onReady={onReady}
            camera={cameraRef}
            registry={registry}
            lightPool={lightPoolRef}
          />
          {showStats && <StatsWriter target={statsRef} />}
          <MaterialsProvider>
            <ModelsProvider>
              <SceneContent
                registry={registry}
                quality={quality}
                lightPool={lightPoolRef}
                viewOnly={viewOnlyRef}
              />
            </ModelsProvider>
          </MaterialsProvider>
        </SceneSessionProvider>
      </Canvas>
      {showStats && (
        <pre
          ref={statsRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-2 left-2 rounded-sm bg-surface/80 px-2 py-1 font-mono text-fg-muted text-xs"
        />
      )}
    </div>
  );
}

function SessionBridge() {
  const session = useSceneSession();
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => connectInvalidate(session, invalidate), [session, invalidate]);
  return null;
}

/** Turning view-only drops the selection and hover: nothing can act on them any more. */
function ViewOnlyGuard({ viewOnly }: { viewOnly: boolean }) {
  const session = useSceneSession();
  useEffect(() => {
    if (!viewOnly) return;
    session.setHover(null);
    if (session.getState().selection.length > 0) session.select([]);
  }, [session, viewOnly]);
  return null;
}

function ContextWatcher(props: {
  onLost: (() => void) | undefined;
  onRestored: (() => void) | undefined;
}) {
  const canvas = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const handlers = useRef(props);
  handlers.current = props;
  useEffect(
    () =>
      watchContext(canvas, {
        onLost: () => handlers.current.onLost?.(),
        onRestored: () => {
          invalidate(); // redraw as soon as the context is back
          handlers.current.onRestored?.();
        },
      }),
    [canvas, invalidate],
  );
  return null;
}

function ReadyReporter(props: {
  onReady: ((handle: SceneHandle) => void) | undefined;
  camera: RefObject<CameraHandle | null>;
  registry: EntityRegistry;
  lightPool: RefObject<LightPoolDriver | null>;
}) {
  const { camera, registry, lightPool } = props;
  const session = useSceneSession();
  const catalog = useSceneCatalog();
  const transient = useTransientStore();
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const callback = useRef(props.onReady);
  callback.current = props.onReady;
  const placement = useMemo(
    () =>
      createPlacementApi({
        controller: new PlaceController({ session, catalog, transient, invalidate }),
        canvas: gl.domElement,
        getCamera: () => get().camera,
      }),
    [session, catalog, transient, invalidate, gl, get],
  );
  const openingPlacement = useMemo(
    () =>
      createPlacementApi({
        controller: new OpeningPlaceController({ session, transient, invalidate }),
        canvas: gl.domElement,
        getCamera: () => get().camera,
      }),
    [session, transient, invalidate, gl, get],
  );
  const handle = useMemo<SceneHandle>(
    () => ({
      renderInfo: () => readRenderInfo(gl.info),
      lights: () => ({
        ...(lightPool.current?.info() ?? { points: 0, spots: 0, lit: [] }),
        sceneLights: countLights(scene),
      }),
      roomDisplay: (roomId) => readRoomDisplay(scene, roomId),
      project: (id, local) => projectEntity(registry.get(id), get().camera, gl.domElement, local),
      mutate: createMutate(invalidate),
      invalidate: () => invalidate(),
      placement,
      openingPlacement,
      live: liveTransformOf(transient),
      // The rig mounts after this handle may be built, so every call looks it up when it happens.
      camera: {
        fit: () => camera.current?.fit(),
        snapshot: () => camera.current?.snapshot() ?? null,
        orbit: (azimuth, polar) => camera.current?.orbit(azimuth, polar),
        dolly: (distance) => camera.current?.dolly(distance),
        setInputBlocked: (blocked) => camera.current?.setInputBlocked(blocked),
      },
    }),
    [
      gl,
      scene,
      get,
      invalidate,
      camera,
      registry,
      placement,
      openingPlacement,
      transient,
      lightPool,
    ],
  );
  useEffect(() => {
    callback.current?.(handle);
  }, [handle]);
  return null;
}

function countLights(scene: Object3D): number {
  let count = 0;
  scene.traverse((node) => {
    if ((node as Light).isLight) count += 1;
  });
  return count;
}

const projected = new Vector3();

function projectEntity(
  object: Object3D | undefined,
  camera: Parameters<Vector3['project']>[0],
  canvas: HTMLCanvasElement,
  local: readonly [number, number, number] = [0, 0.1, 0],
): { x: number; y: number } | null {
  if (!object) return null;
  object.updateWorldMatrix(true, false);
  // By default a little above the floor, where the placeholder box is.
  projected.set(local[0], local[1], local[2]).applyMatrix4(object.matrixWorld).project(camera);
  if (projected.z > 1) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + ((projected.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - projected.y) / 2) * rect.height,
  };
}

function readRoomDisplay(scene: Object3D, roomId: RoomId): RoomDisplay | null {
  const walls = scene.getObjectByName(roomObjectName.walls(roomId));
  const ceiling = scene.getObjectByName(roomObjectName.ceiling(roomId));
  if (!walls || !ceiling) return null;
  const wallOpacity = {} as Record<WallId, number>;
  for (const wall of WALL_IDS) {
    const mesh = scene.getObjectByName(roomObjectName.wall(roomId, wall)) as Mesh | undefined;
    wallOpacity[wall] = (mesh?.material as Material | undefined)?.opacity ?? Number.NaN;
  }
  return { wallOpacity, wallHeightScale: walls.scale.y, ceilingVisible: ceiling.visible };
}

/**
 * Writes renderer counters straight into the DOM after each rendered frame: no React state (hot
 * path). `addAfterEffect` runs once per frame the loop actually draws, so with demand rendering
 * the overlay only changes when the picture does.
 */
function StatsWriter({ target }: { target: RefObject<HTMLPreElement | null> }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const write = () => {
      if (target.current) target.current.textContent = formatRenderInfo(readRenderInfo(gl.info));
    };
    write();
    return addAfterEffect(write);
  }, [gl, target]);
  return null;
}
