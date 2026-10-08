'use client';

import type { EditorSession } from '@roomforge/core';
import { createContext, type ReactNode, useContext } from 'react';

const SceneSessionContext = createContext<EditorSession | null>(null);

/** Gives components inside the R3F canvas access to the session (the canvas has its own React root). */
export function SceneSessionProvider({
  session,
  children,
}: {
  session: EditorSession;
  children: ReactNode;
}) {
  return <SceneSessionContext.Provider value={session}>{children}</SceneSessionContext.Provider>;
}

export function useSceneSession(): EditorSession {
  const session = useContext(SceneSessionContext);
  if (!session) throw new Error('useSceneSession must be used inside <SceneCanvas>');
  return session;
}
