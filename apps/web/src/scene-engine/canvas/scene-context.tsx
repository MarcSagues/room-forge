'use client';

import type { CatalogProvider, EditorSession } from '@roomforge/core';
import { createContext, type ReactNode, useContext } from 'react';

const SceneSessionContext = createContext<EditorSession | null>(null);

/** Every catalog id is unknown (I6): objects draw and pick as placeholder boxes. */
const NO_CATALOG: CatalogProvider = { getItem: () => undefined };
const SceneCatalogContext = createContext<CatalogProvider>(NO_CATALOG);

/**
 * Gives components inside the R3F canvas access to the session and the catalog (the canvas has its
 * own React root).
 */
export function SceneSessionProvider({
  session,
  catalog = NO_CATALOG,
  children,
}: {
  session: EditorSession;
  catalog?: CatalogProvider;
  children: ReactNode;
}) {
  return (
    <SceneSessionContext.Provider value={session}>
      <SceneCatalogContext.Provider value={catalog}>{children}</SceneCatalogContext.Provider>
    </SceneSessionContext.Provider>
  );
}

export function useSceneSession(): EditorSession {
  const session = useContext(SceneSessionContext);
  if (!session) throw new Error('useSceneSession must be used inside <SceneCanvas>');
  return session;
}

/** Object sizes for placeholders and pick proxies. */
export function useSceneCatalog(): CatalogProvider {
  return useContext(SceneCatalogContext);
}
