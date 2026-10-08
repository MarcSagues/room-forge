'use client';

import { addAfterEffect, Canvas, useThree } from '@react-three/fiber';
import {
  type CatalogProvider,
  type EditorSession,
  type ObjectId,
  type RoomId,
  WALL_IDS,
  type WallId,
} from '@roomforge/core';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { type Material, type Mesh, NeutralToneMapping, type Object3D, Vector3 } from 'three';
import type { CameraHandle, CameraSnapshot } from '../camera/camera-director';
import { CameraRig } from '../camera/camera-rig';
import { createEntityRegistry, type EntityRegistry } from '../objects/entity-registry';
import { roomObjectName } from '../room/room-mesh';
import { watchContext } from './context-events';
import { connectInvalidate } from './invalidate-bridge';
import { createMutate, type Mutate } from './mutate';
import { formatRenderInfo, type RenderInfo, readRenderInfo } from './render-info';
import { SceneContent } from './scene-content';
import { SceneSessionProvider, useSceneSession } from './scene-context';

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
   */
  project(id: ObjectId): { x: number; y: number } | null;
  /** Renderer counters (frame, draw calls, triangles, programs...). */
  renderInfo(): RenderInfo;
  /** Run a direct three.js mutation and request a frame. */
  mutate: Mutate;
  invalidate(): void;
  camera: SceneCamera;
}

export interface SceneCanvasProps {
  session: EditorSession;
  /** Object sizes for placeholders and picking; unknown ids draw as placeholder boxes. */
  catalog?: CatalogProvider;
  onReady?: (handle: SceneHandle) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  /** Dev overlay with renderer counters. Defaults to on outside production builds. */
  showStats?: boolean;
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
  } = props;
  const statsRef = useRef<HTMLPreElement>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const registry = useMemo(() => createEntityRegistry(), []);
  return (
    <div className="relative size-full">
      {/* The camera rig owns the cameras (R3F's default one is replaced as soon as it mounts). */}
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping;
        }}
      >
        <SceneSessionProvider session={session} {...(catalog ? { catalog } : {})}>
          <SessionBridge />
          <ContextWatcher onLost={onContextLost} onRestored={onContextRestored} />
          <CameraRig handleRef={cameraRef} />
          <ReadyReporter onReady={onReady} camera={cameraRef} registry={registry} />
          {showStats && <StatsWriter target={statsRef} />}
          <SceneContent registry={registry} />
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
}) {
  const { camera, registry } = props;
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const callback = useRef(props.onReady);
  callback.current = props.onReady;
  const handle = useMemo<SceneHandle>(
    () => ({
      renderInfo: () => readRenderInfo(gl.info),
      roomDisplay: (roomId) => readRoomDisplay(scene, roomId),
      project: (id) => projectEntity(registry.get(id), get().camera, gl.domElement),
      mutate: createMutate(invalidate),
      invalidate: () => invalidate(),
      // The rig mounts after this handle may be built, so every call looks it up when it happens.
      camera: {
        fit: () => camera.current?.fit(),
        snapshot: () => camera.current?.snapshot() ?? null,
        orbit: (azimuth, polar) => camera.current?.orbit(azimuth, polar),
        dolly: (distance) => camera.current?.dolly(distance),
      },
    }),
    [gl, scene, get, invalidate, camera, registry],
  );
  useEffect(() => {
    callback.current?.(handle);
  }, [handle]);
  return null;
}

const projected = new Vector3();

function projectEntity(
  object: Object3D | undefined,
  camera: Parameters<Vector3['project']>[0],
  canvas: HTMLCanvasElement,
): { x: number; y: number } | null {
  if (!object) return null;
  object.updateWorldMatrix(true, false);
  // A little above the floor, where the placeholder box is.
  projected.set(0, 0.1, 0).applyMatrix4(object.matrixWorld).project(camera);
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
