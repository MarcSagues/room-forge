'use client';

import { useEffect, useRef, useState } from 'react';
import { emptyCatalog } from '@/asset-library';
import { createDemoSession } from '@/editor';
import { SceneCanvas, type SceneHandle } from '@/scene-engine';
import { EditorShell } from '@/ui';
import { installTestHook } from './test-hook';

/** Composition root of the editor route: session + shell + canvas (client-only, loaded by the loader). */
export default function EditorApp() {
  const [session] = useState(() => createDemoSession(emptyCatalog));
  const scene = useRef<SceneHandle | null>(null);

  useEffect(() => installTestHook(window, { session, getScene: () => scene.current }), [session]);

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
