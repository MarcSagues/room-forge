'use client';

import type { EditorSession } from '@roomforge/core';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { createTransientStore, type TransientStore } from '../interaction/transient-store';
import type { SceneCatalog } from './scene-catalog';

export type { SceneCatalog } from './scene-catalog';

const SceneSessionContext = createContext<EditorSession | null>(null);

/** Every catalog id is unknown (I6): objects draw and pick as placeholder boxes. */
const NO_CATALOG: SceneCatalog = { getItem: () => undefined };
const SceneCatalogContext = createContext<SceneCatalog>(NO_CATALOG);
const TransientContext = createContext<TransientStore | null>(null);

/**
 * Gives components inside the R3F canvas access to the session and the catalog (the canvas has its
 * own React root).
 */
export function SceneSessionProvider({
  session,
  catalog = NO_CATALOG,
  transient,
  children,
}: {
  session: EditorSession;
  catalog?: SceneCatalog;
  /** Per-frame interaction state (drag pose); one is created if not given. */
  transient?: TransientStore;
  children: ReactNode;
}) {
  const fallback = useMemo(() => createTransientStore(), []);
  return (
    <SceneSessionContext.Provider value={session}>
      <SceneCatalogContext.Provider value={catalog}>
        <TransientContext.Provider value={transient ?? fallback}>
          {children}
        </TransientContext.Provider>
      </SceneCatalogContext.Provider>
    </SceneSessionContext.Provider>
  );
}

export function useSceneSession(): EditorSession {
  const session = useContext(SceneSessionContext);
  if (!session) throw new Error('useSceneSession must be used inside <SceneCanvas>');
  return session;
}

/** Object sizes for placeholders and pick proxies. */
export function useSceneCatalog(): SceneCatalog {
  return useContext(SceneCatalogContext);
}

/** The transient (per-frame, non-document) interaction store. */
export function useTransientStore(): TransientStore {
  const store = useContext(TransientContext);
  if (!store) throw new Error('useTransientStore must be used inside <SceneCanvas>');
  return store;
}
