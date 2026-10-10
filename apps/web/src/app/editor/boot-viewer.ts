import {
  type CatalogProvider,
  createEditorSession,
  createNanoIdGen,
  type ProjectId,
  ProjectIdSchema,
  type ProjectRepository,
  RepositoryError,
  type SceneDocument,
  type ShareCodec,
  type ShareErrorCode,
} from '@roomforge/core';
import { createMemoryProjectRepository, type OpenedRepository, openShareLink } from '@/persistence';
import type { BootedEditor } from './boot-editor';

export type ViewerBoot =
  | { phase: 'loading' }
  | { phase: 'failed'; code: ShareErrorCode }
  | { phase: 'ready'; editor: BootedEditor };

/**
 * Opens the room of a shared link (P6-08) in a read-only session. Nothing is stored: the project
 * lives in memory until the person makes a copy, and there is no lock, autosave or journal.
 */
export async function bootViewer(
  hash: string,
  options: { catalog: CatalogProvider; untitledName: string; codec?: ShareCodec },
): Promise<ViewerBoot> {
  const opened = await openShareLink(hash, {
    catalog: options.catalog,
    ...(options.codec ? { codec: options.codec } : {}),
  });
  if (!opened.ok) return { phase: 'failed', code: opened.error.code };
  const { document } = opened.value;
  const name = opened.value.name.trim() || options.untitledName;
  const session = createEditorSession({ initialDocument: document, catalog: options.catalog });
  session.setReadOnly(true);
  return {
    phase: 'ready',
    editor: {
      session,
      project: { id: 'shared' as ProjectId, name, document, createdAt: 0, updatedAt: 0 },
      repository: createMemoryProjectRepository(),
      storage: 'memory',
      created: false,
      recovered: false,
      journal: undefined,
    },
  };
}

/**
 * Saves the shared room as a new project of the person's and says which: a copy under a new id,
 * whatever the link's ids were. A browser that stores nothing cannot keep it, so that is an error.
 */
export async function copySharedProject(
  project: { name: string; document: SceneDocument },
  openRepository: () => Promise<OpenedRepository>,
  makeId: () => string = createNanoIdGen(),
): Promise<ProjectId> {
  const opened = await openRepository();
  try {
    if (opened.mode === 'memory') {
      throw new RepositoryError('UNAVAILABLE', 'The browser stores no projects here');
    }
    const repository: ProjectRepository = opened.repository;
    const saved = await repository.save({
      id: ProjectIdSchema.parse(makeId()),
      name: project.name,
      document: project.document,
    });
    return saved.id;
  } finally {
    await opened.close();
  }
}
