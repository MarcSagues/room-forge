'use client';

import { addAfterEffect, Canvas, useThree } from '@react-three/fiber';
import { type EditorSession, type RoomId, WALL_IDS, type WallId } from '@roomforge/core';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { type Material, type Mesh, NeutralToneMapping, type Object3D } from 'three';
import type { CameraHandle, CameraSnapshot } from '../camera/camera-director';
import { CameraRig } from '../camera/camera-rig';
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
  /** Renderer counters (frame, draw calls, triangles, programs...). */
  renderInfo(): RenderInfo;
  /** Run a direct three.js mutation and request a frame. */
  mutate: Mutate;
  invalidate(): void;
  camera: SceneCamera;
}

export interface SceneCanvasProps {
  session: EditorSession;
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
    onReady,
    onContextLost,
    onContextRestored,
    showStats = showStatsByDefault,
  } = props;
  const statsRef = useRef<HTMLPreElement>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
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
        <SceneSessionProvider session={session}>
          <SessionBridge />
          <ContextWatcher onLost={onContextLost} onRestored={onContextRestored} />
          <CameraRig handleRef={cameraRef} />
          <ReadyReporter onReady={onReady} camera={cameraRef} />
          {showStats && <StatsWriter target={statsRef} />}
          <SceneContent />
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
}) {
  const { camera } = props;
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const callback = useRef(props.onReady);
  callback.current = props.onReady;
  const handle = useMemo<SceneHandle>(
    () => ({
      renderInfo: () => readRenderInfo(gl.info),
      roomDisplay: (roomId) => readRoomDisplay(scene, roomId),
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
    [gl, scene, invalidate, camera],
  );
  useEffect(() => {
    callback.current?.(handle);
  }, [handle]);
  return null;
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
