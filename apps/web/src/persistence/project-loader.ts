import {
  type CatalogProvider,
  createNanoIdGen,
  type IdGen,
  type ImportError,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  type ProjectId,
  ProjectIdSchema,
  type ProjectRepository,
  parseProjectValue,
  RepositoryError,
  type SceneDocument,
  type StoredProject,
  uniqueProjectName,
} from '@roomforge/core';
import { toRepositoryError } from './errors';
import type { Journal } from './journal';
import type { KeyValueStorage } from './key-value-storage';

export type { KeyValueStorage };

/** Where the id of the project that was open last is kept, to come back to it. */
export const LAST_PROJECT_KEY = 'roomforge.lastProject';

/** Notes (or, with `null`, forgets) the project that is open. Never throws: it is a convenience. */
export function rememberLastProject(
  storage: KeyValueStorage | undefined,
  projectId: ProjectId | null,
): void {
  try {
    if (projectId === null) storage?.removeItem(LAST_PROJECT_KEY);
    else storage?.setItem(LAST_PROJECT_KEY, projectId);
  } catch {
    // Blocked or full: the editor still opens, it just will not remember where it was.
  }
}

function lastProject(storage: KeyValueStorage | undefined): string | null {
  try {
    return storage?.getItem(LAST_PROJECT_KEY) ?? null;
  } catch {
    return null;
  }
}

export interface OpenedProject {
  /** The project to edit; its document is validated and up to date. */
  project: StoredProject;
  /** A new project was made because there was nothing to open. */
  created: boolean;
  /** The stored document was in an older format and has been brought up to date (and saved so). */
  migrated: boolean;
  /** The last visit ended before its latest changes were written; they were recovered. */
  recovered: boolean;
}

/** Why a project could not be opened, in terms the UI can explain. */
export type OpenFailure =
  | { kind: 'not-found'; id: string }
  /** The stored document is damaged or from an incompatible version; it is left as it is. */
  | { kind: 'unreadable'; id: string; import: ImportError }
  | { kind: 'storage'; error: RepositoryError };

export type OpenResult = { ok: true; value: OpenedProject } | { ok: false; error: OpenFailure };

export interface OpenProjectOptions {
  repository: ProjectRepository;
  /** From the address (`?project=`). Absent or empty: come back to the last one, or start one. */
  projectId?: string | null;
  storage?: KeyValueStorage | undefined;
  /** The document a new project starts with. */
  createDocument(): SceneDocument;
  /** Name of a new project (made unique among the existing ones). */
  untitledName: string;
  idGen?: IdGen;
  catalog?: CatalogProvider;
  /** Where the last visit wrote down unsaved work as the page went away. */
  journal?: Journal;
}

const fail = (error: OpenFailure): OpenResult => ({ ok: false, error });

/**
 * Decides which project the editor opens, and opens it (P6-03). Asked for one, it opens exactly
 * that one or says why not, and never substitutes another. Not asked, it comes back to the project
 * that was open last, and starts a new one only when there is none (or it has been deleted since).
 * What it reads goes through the same checks as an imported file, so an old document is migrated
 * and a damaged one is reported instead of crashing the editor; a damaged one is never overwritten.
 */
export async function openProjectForEditing(options: OpenProjectOptions): Promise<OpenResult> {
  const { repository, storage, catalog } = options;
  const asked = options.projectId ? options.projectId : null;
  const remembered = asked === null ? lastProject(storage) : null;
  const wanted = asked ?? remembered;

  if (wanted !== null) {
    const parsedId = ProjectIdSchema.safeParse(wanted);
    if (!parsedId.success) {
      // A link with something that is not an id is "no such project"; a stale memory is ignored.
      if (asked !== null) return fail({ kind: 'not-found', id: wanted });
    } else {
      let stored: StoredProject | undefined;
      try {
        stored = await repository.get(parsedId.data);
      } catch (error) {
        return fail({ kind: 'storage', error: toRepositoryError(error, 'operation') });
      }
      if (stored) return await readStored(repository, stored, storage, catalog, options.journal);
      if (asked !== null) return fail({ kind: 'not-found', id: wanted });
    }
  }
  return createFirstProject(options);
}

async function readStored(
  repository: ProjectRepository,
  stored: StoredProject,
  storage: KeyValueStorage | undefined,
  catalog: CatalogProvider | undefined,
  journal: Journal | undefined,
): Promise<OpenResult> {
  const check = (name: string, document: unknown) =>
    parseProjectValue(
      {
        format: PROJECT_FORMAT,
        formatVersion: PROJECT_FORMAT_VERSION,
        project: { name },
        document,
      },
      catalog ? { catalog } : {},
    );
  const parsed = check(stored.name, stored.document);
  if (!parsed.ok) return fail({ kind: 'unreadable', id: stored.id, import: parsed.error });

  let document = parsed.value.document;
  let migrated = parsed.value.migratedFrom !== undefined;

  // A journal newer than the last save is work the last visit could not write (the browser aborts
  // a closing page's IndexedDB transactions). It goes through the same checks as anything stored.
  let recovered = false;
  const entry = journal?.read(stored.id);
  if (entry && entry.at > stored.updatedAt) {
    const fromJournal = check(stored.name, entry.document);
    if (fromJournal.ok) {
      document = fromJournal.value.document;
      migrated = migrated || fromJournal.value.migratedFrom !== undefined;
      recovered = true;
    } else {
      journal?.clear(stored.id);
    }
  } else if (entry) {
    journal?.clear(stored.id);
  }

  const project: StoredProject = { ...stored, document };
  if (migrated || recovered) {
    try {
      // Written back, in the current format: the old shape is read once, and recovered work is kept.
      await repository.save({ id: stored.id, name: stored.name, document });
    } catch (error) {
      return fail({ kind: 'storage', error: toRepositoryError(error, 'operation') });
    }
    if (recovered) journal?.clear(stored.id);
  }
  rememberLastProject(storage, stored.id);
  return { ok: true, value: { project, created: false, migrated, recovered } };
}

async function createFirstProject(options: OpenProjectOptions): Promise<OpenResult> {
  const { repository, storage } = options;
  const idGen = options.idGen ?? createNanoIdGen();
  try {
    const taken = (await repository.list()).map((summary) => summary.name);
    const id = ProjectIdSchema.parse(idGen());
    const name = uniqueProjectName(options.untitledName, taken);
    const document = options.createDocument();
    const saved = await repository.save({ id, name, document });
    rememberLastProject(storage, id);
    return {
      ok: true,
      value: { project: { ...saved, document }, created: true, migrated: false, recovered: false },
    };
  } catch (error) {
    return fail({
      kind: 'storage',
      error: error instanceof RepositoryError ? error : toRepositoryError(error, 'operation'),
    });
  }
}
