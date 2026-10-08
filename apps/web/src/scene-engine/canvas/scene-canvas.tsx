'use client';

import { addAfterEffect, Canvas, useThree } from '@react-three/fiber';
import type { EditorSession } from '@roomforge/core';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { NeutralToneMapping } from 'three';
import { watchContext } from './context-events';
import { connectInvalidate } from './invalidate-bridge';
import { createMutate, type Mutate } from './mutate';
import { formatRenderInfo, type RenderInfo, readRenderInfo } from './render-info';
import { SceneContent } from './scene-content';
import { SceneSessionProvider, useSceneSession } from './scene-context';

/** What the host (app, E2E hook) can do with a mounted scene. */
export interface SceneHandle {
  /** Renderer counters (frame, draw calls, triangles, programs...). */
  renderInfo(): RenderInfo;
  /** Run a direct three.js mutation and request a frame. */
  mutate: Mutate;
  invalidate(): void;
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
  return (
    <div className="relative size-full">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [6, 5, 6], fov: 50, near: 0.1, far: 200 }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping;
        }}
      >
        <SceneSessionProvider session={session}>
          <SessionBridge />
          <ContextWatcher onLost={onContextLost} onRestored={onContextRestored} />
          <ReadyReporter onReady={onReady} />
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

function ReadyReporter({ onReady }: { onReady: ((handle: SceneHandle) => void) | undefined }) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const callback = useRef(onReady);
  callback.current = onReady;
  const handle = useMemo<SceneHandle>(
    () => ({
      renderInfo: () => readRenderInfo(gl.info),
      mutate: createMutate(invalidate),
      invalidate: () => invalidate(),
    }),
    [gl, invalidate],
  );
  useEffect(() => {
    callback.current?.(handle);
  }, [handle]);
  return null;
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
