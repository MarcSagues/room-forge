'use client';

import { nextWallMode } from '@roomforge/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { emptyCatalog } from '@/asset-library';
import { createDemoSession, installHotkeys } from '@/editor';
import { type LiveTransform, SceneCanvas, type SceneHandle } from '@/scene-engine';
import { EditorShell, SelectionSummary } from '@/ui';
import { installTestHook } from './test-hook';

/** Composition root of the editor route: session + shell + canvas (client-only, loaded by the loader). */
export default function EditorApp() {
  const [session] = useState(() => createDemoSession(emptyCatalog));
  const scene = useRef<SceneHandle | null>(null);

  useEffect(() => installTestHook(window, { session, getScene: () => scene.current }), [session]);

  useEffect(
    () =>
      installHotkeys(window, {
        setView: (view) => session.setView(view),
        fit: () => scene.current?.camera.fit(),
        cycleWalls: () => session.setWallMode(nextWallMode(session.getState().wallMode)),
        toggleCeiling: () => session.setShowCeiling(!session.getState().showCeiling),
        deselect: () => session.select([]),
      }),
    [session],
  );

  // The panel follows a drag in the scene through this; the scene may not be mounted yet, so each
  // call looks it up when it happens.
  const live = useMemo<LiveTransform>(
    () => ({
      read: () => scene.current?.live.read() ?? null,
      subscribe: (listener) => scene.current?.live.subscribe(listener) ?? (() => {}),
    }),
    [],
  );

  return (
    <EditorShell
      properties={<SelectionSummary session={session} catalog={emptyCatalog} live={live} />}
      viewport={
        <SceneCanvas
          session={session}
          catalog={emptyCatalog}
          onReady={(handle) => {
            scene.current = handle;
          }}
        />
      }
    />
  );
}
