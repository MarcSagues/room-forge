'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { ImageExporterLoader } from './image-export';
import type { SaveIndicator } from './save-status';

/** What the top bar shows about the project that is open. */
export interface ProjectStatus {
  /** The project's name; the generic "Untitled project" while it is not known. */
  name: string | undefined;
  save: SaveIndicator;
  /** Exports the open project as a file; without it the Export button is the placeholder. */
  onExport?: (() => void) | undefined;
  /** Renames the open project; rejects with the storage error. Without it the name is a link. */
  onRename?: ((name: string) => Promise<void>) | undefined;
  /** Copies a link to a read-only copy of the project; without it Share is the placeholder. */
  onShare?: (() => Promise<ShareOutcome>) | undefined;
  /** Exports an image of the view; adds "Image (.png)" to the Export menu. */
  imageExport?: ImageExporterLoader | undefined;
}

/** What became of a request to share: the button tells the person. */
export type ShareOutcome =
  | { kind: 'copied'; length: number; long: boolean }
  | { kind: 'too-large' | 'unsupported' | 'copy-failed' };

const DEFAULT: ProjectStatus = {
  name: undefined,
  save: 'saved',
  onExport: undefined,
  onRename: undefined,
  onShare: undefined,
  imageExport: undefined,
};

const ProjectStatusContext = createContext<ProjectStatus>(DEFAULT);

/**
 * Hands the open project's name and save state to the top bar without threading them through the
 * shell's layouts. Without a provider the bar shows the placeholders it always had.
 */
export function ProjectStatusProvider(props: ProjectStatus & { children: ReactNode }) {
  const { name, save, onExport, onRename, onShare, imageExport, children } = props;
  const value = useMemo(
    () => ({ name, save, onExport, onRename, onShare, imageExport }),
    [name, save, onExport, onRename, onShare, imageExport],
  );
  return <ProjectStatusContext.Provider value={value}>{children}</ProjectStatusContext.Provider>;
}

export function useProjectStatus(): ProjectStatus {
  return useContext(ProjectStatusContext);
}
