import {
  type CatalogProvider,
  createEditorSession,
  createStarterDocument,
  type EditorSession,
  type IdGen,
  type ProjectRepository,
  type StoredProject,
} from '@roomforge/core';
import {
  type Journal,
  type KeyValueStorage,
  type OpenedRepository,
  type OpenFailure,
  openProjectForEditing,
} from '@/persistence';

/** Everything the editor needs once its project is open. */
export interface BootedEditor {
  session: EditorSession;
  project: StoredProject;
  repository: ProjectRepository;
  /** `memory` when the browser stores nothing: the person is told, and can export a copy. */
  storage: OpenedRepository['mode'];
  /** The project was just created, because there was nothing to open. */
  created: boolean;
  /** The last visit ended before its latest changes were written; they were recovered. */
  recovered: boolean;
  /** Where unsaved work is written down as the page goes away; autosave uses it too. */
  journal: Journal | undefined;
}

export type Boot =
  | { phase: 'loading' }
  | { phase: 'failed'; failure: OpenFailure }
  | { phase: 'ready'; editor: BootedEditor };

export interface BootOptions {
  openRepository(): Promise<OpenedRepository>;
  /** `window.location.search`: `?project=<id>` says which project to open. */
  search: string;
  storage: KeyValueStorage | undefined;
  journal?: Journal;
  catalog: CatalogProvider;
  untitledName: string;
  idGen?: IdGen;
}

/**
 * Opens the storage and the project the editor starts with (P6-03): the one in the address, or the
 * one that was open last, or a new one. Pure of React so it is tested without it; the hook only
 * asks for it once. On failure it lets go of the database connection it opened.
 */
export async function bootEditor(options: BootOptions): Promise<Boot> {
  const opened = await options.openRepository();
  const projectId = new URLSearchParams(options.search).get('project');
  const result = await openProjectForEditing({
    repository: opened.repository,
    projectId,
    storage: options.storage,
    ...(options.journal ? { journal: options.journal } : {}),
    createDocument: () => createStarterDocument(),
    untitledName: options.untitledName,
    catalog: options.catalog,
    ...(options.idGen ? { idGen: options.idGen } : {}),
  });
  if (!result.ok) {
    await opened.close();
    return { phase: 'failed', failure: result.error };
  }
  const { project, created, recovered } = result.value;
  const session = createEditorSession({
    initialDocument: project.document,
    catalog: options.catalog,
  });
  return {
    phase: 'ready',
    editor: {
      session,
      project,
      repository: opened.repository,
      storage: opened.mode,
      created,
      recovered,
      journal: options.journal,
    },
  };
}
