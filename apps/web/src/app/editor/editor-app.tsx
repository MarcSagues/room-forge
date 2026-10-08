'use client';

import { nextWallMode } from '@roomforge/core';
import { useEffect, useRef, useState } from 'react';
import { emptyCatalog } from '@/asset-library';
import { createDemoSession, installHotkeys } from '@/editor';
import { SceneCanvas, type SceneHandle } from '@/scene-engine';
import { EditorShell } from '@/ui';
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
      }),
    [session],
  );

  return (
    <EditorShell
      viewport={
        <SceneCanvas
          session={session}
          onReady={(handle) => {
            scene.current = handle;
          }}
        />
      }
    />
  );
}
