'use client';

import { nextWallMode } from '@roomforge/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { catalogEntries, stubCatalog } from '@/asset-library';
import { createDemoSession, installHotkeys } from '@/editor';
import { type LiveTransform, SceneCanvas, type SceneHandle } from '@/scene-engine';
import { CatalogPanel, type CatalogPanelItem, EditorShell, SelectionSummary } from '@/ui';
import { installTestHook } from './test-hook';

/** What the catalog panel lists: the stub manifest until the real catalog arrives (P4-06). */
const CATALOG_ITEMS: readonly CatalogPanelItem[] = catalogEntries().map((entry) => ({
  id: entry.id,
  name: entry.name.en,
  color: entry.color,
  size: entry.size,
}));

/** Composition root of the editor route: session + shell + canvas (client-only, loaded by the loader). */
export default function EditorApp() {
  const [session] = useState(() => createDemoSession(stubCatalog));
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

  return (
    <EditorShell
      catalog={
        <CatalogPanel
          items={CATALOG_ITEMS}
          placement={placement}
          onPlace={(id) => scene.current?.placement.placeAtCenter(id) ?? false}
        />
      }
      properties={<SelectionSummary session={session} catalog={stubCatalog} live={live} />}
      viewport={
        <SceneCanvas
          session={session}
          catalog={stubCatalog}
          onReady={(handle) => {
            scene.current = handle;
          }}
        />
      }
    />
  );
}
