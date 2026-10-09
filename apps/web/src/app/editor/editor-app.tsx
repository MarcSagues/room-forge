'use client';

import { nextWallMode } from '@roomforge/core';
import { useEffect, useRef, useState } from 'react';
import { emptyCatalog } from '@/asset-library';
import { createDemoSession, type ErrorLog, installHotkeys } from '@/editor';
import { SceneCanvas, type SceneHandle } from '@/scene-engine';
import { ContextNotice, type ContextState, EditorShell, SelectionSummary } from '@/ui';
import { installTestHook } from './test-hook';

/** Composition root of the editor route: session + shell + canvas (client-only, loaded by the loader). */
export default function EditorApp({ errorLog }: { errorLog?: ErrorLog }) {
  const [session] = useState(() => createDemoSession(emptyCatalog));
  const [context, setContext] = useState<ContextState>('ok');
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

  // After a lost context the scene is redrawn from the session (which lives outside the canvas),
  // so the notice only has to say so, and then goes away on its own.
  useEffect(() => {
    if (context !== 'restored') return;
    const timer = setTimeout(() => setContext('ok'), 2500);
    return () => clearTimeout(timer);
  }, [context]);

  return (
    <EditorShell
      onPanelError={(error, panel) => errorLog?.record(error, { source: 'react', where: panel })}
      properties={<SelectionSummary session={session} />}
      viewport={
        <>
          <SceneCanvas
            session={session}
            catalog={emptyCatalog}
            onReady={(handle) => {
              scene.current = handle;
            }}
            onContextLost={() => {
              setContext('lost');
              errorLog?.record('The WebGL context was lost', {
                source: 'webgl',
                where: 'Viewport',
              });
            }}
            onContextRestored={() => setContext('restored')}
          />
          <ContextNotice state={context} />
        </>
      }
    />
  );
}
