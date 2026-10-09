'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { emptyCatalog } from '@/asset-library';
import { createDemoSession, createShortcutRegistry, editorShortcuts } from '@/editor';
import { SceneCanvas, type SceneHandle } from '@/scene-engine';
import { EditorShell, SelectionSummary } from '@/ui';
import { installTestHook } from './test-hook';

/** Composition root of the editor route: session + shell + canvas (client-only, loaded by the loader). */
export default function EditorApp() {
  const [session] = useState(() => createDemoSession(emptyCatalog));
  const scene = useRef<SceneHandle | null>(null);

  useEffect(() => installTestHook(window, { session, getScene: () => scene.current }), [session]);

  // The shortcuts are data: the editor's own go in here, the shell adds the panels and the help.
  const shortcuts = useMemo(() => {
    const registry = createShortcutRegistry();
    registry.registerAll(editorShortcuts({ session, fit: () => scene.current?.camera.fit() }));
    return registry;
  }, [session]);

  return (
    <EditorShell
      session={session}
      shortcuts={shortcuts}
      properties={<SelectionSummary session={session} />}
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
