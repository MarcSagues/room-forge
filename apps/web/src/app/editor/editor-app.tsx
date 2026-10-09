'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { catalogEntries, stubCatalog } from '@/asset-library';
import {
  createDemoSession,
  createShortcutRegistry,
  type ErrorLog,
  editorShortcuts,
} from '@/editor';
import { type LiveTransform, SceneCanvas, type SceneHandle } from '@/scene-engine';
import {
  CatalogPanel,
  type CatalogPanelItem,
  ContextNotice,
  type ContextState,
  EditorShell,
  SelectionSummary,
} from '@/ui';
import { installTestHook } from './test-hook';

/** What the catalog panel lists: the stub manifest until the real catalog arrives (P4-06). */
const CATALOG_ITEMS: readonly CatalogPanelItem[] = catalogEntries().map((entry) => ({
  id: entry.id,
  name: entry.name.en,
  color: entry.color,
  size: entry.size,
}));

/** Composition root of the editor route: session + shell + canvas (client-only, loaded by the loader). */
export default function EditorApp({ errorLog }: { errorLog?: ErrorLog }) {
  const [session] = useState(() => createDemoSession(stubCatalog));
  const [context, setContext] = useState<ContextState>('ok');
  const scene = useRef<SceneHandle | null>(null);

  useEffect(() => installTestHook(window, { session, getScene: () => scene.current }), [session]);

  // The shortcuts are data: the editor's own go in here, the shell adds the panels and the help.
  const shortcuts = useMemo(() => {
    const registry = createShortcutRegistry();
    registry.registerAll(editorShortcuts({ session, fit: () => scene.current?.camera.fit() }));
    return registry;
  }, [session]);

  // The panel and the scene only meet here: the scene may not be mounted yet, so each call looks
  // it up when it happens.
  const placement = useMemo(
    () => ({
      begin: (id: string) => scene.current?.placement.begin(id) ?? false,
      move: (x: number, y: number, free: boolean) => scene.current?.placement.move(x, y, free),
      end: (x: number, y: number) => scene.current?.placement.end(x, y) ?? false,
      cancel: () => scene.current?.placement.cancel(),
    }),
    [],
  );
  // The properties panel follows a drag in the scene through this.
  const live = useMemo<LiveTransform>(
    () => ({
      read: () => scene.current?.live.read() ?? null,
      subscribe: (listener) => scene.current?.live.subscribe(listener) ?? (() => {}),
    }),
    [],
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
      session={session}
      shortcuts={shortcuts}
      catalog={
        <CatalogPanel
          items={CATALOG_ITEMS}
          placement={placement}
          onPlace={(id) => scene.current?.placement.placeAtCenter(id) ?? false}
        />
      }
      onPanelError={(error, panel) => errorLog?.record(error, { source: 'react', where: panel })}
      properties={<SelectionSummary session={session} catalog={stubCatalog} live={live} />}
      viewport={
        <>
          <SceneCanvas
            session={session}
            catalog={stubCatalog}
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
