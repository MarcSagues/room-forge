'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { SaveIndicator } from './save-status';

/** What the top bar shows about the project that is open. */
export interface ProjectStatus {
  /** The project's name; the generic "Untitled project" while it is not known. */
  name: string | undefined;
  save: SaveIndicator;
}

const DEFAULT: ProjectStatus = { name: undefined, save: 'saved' };

const ProjectStatusContext = createContext<ProjectStatus>(DEFAULT);

/**
 * Hands the open project's name and save state to the top bar without threading them through the
 * shell's layouts. Without a provider the bar shows the placeholders it always had.
 */
export function ProjectStatusProvider(props: ProjectStatus & { children: ReactNode }) {
  const { name, save, children } = props;
  const value = useMemo(() => ({ name, save }), [name, save]);
  return <ProjectStatusContext.Provider value={value}>{children}</ProjectStatusContext.Provider>;
}

export function useProjectStatus(): ProjectStatus {
  return useContext(ProjectStatusContext);
}
