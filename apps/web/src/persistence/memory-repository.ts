import {
  type Clock,
  copyProjectName,
  createNanoIdGen,
  type IdGen,
  normalizeProjectName,
  ProjectIdSchema,
  type ProjectRepository,
  type ProjectSummary,
  RepositoryError,
  type SceneDocument,
  systemClock,
} from '@roomforge/core';
import { toRepositoryError } from './errors';

export interface MemoryRepositoryOptions {
  clock?: Clock;
  idGen?: IdGen;
}

interface Entry {
  summary: ProjectSummary;
  document: SceneDocument;
}

/** Copies the way a database would, so what is stored cannot change behind the repository's back. */
function copyOf<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch (error) {
    throw toRepositoryError(error, 'operation');
  }
}

/**
 * Projects kept in memory: what the app falls back to when the browser lets it store nothing
 * (private mode, blocked site data), and the repository of tests that do not care about IndexedDB.
 * They last as long as the page.
 */
export function createMemoryProjectRepository(
  options: MemoryRepositoryOptions = {},
): ProjectRepository {
  const { clock = systemClock, idGen = createNanoIdGen() } = options;
  const entries = new Map<string, Entry>();

  const missing = (id: string) => new RepositoryError('NOT_FOUND', `There is no project ${id}`);

  return {
    async list() {
      return [...entries.values()]
        .map((entry) => ({ ...entry.summary }))
        .sort(
          (a, b) =>
            b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id),
        );
    },

    async get(id) {
      const entry = entries.get(id);
      return entry ? { ...entry.summary, document: copyOf(entry.document) } : undefined;
    },

    async save(input) {
      const name = normalizeProjectName(input.name);
      const document = copyOf(input.document);
      const now = clock.now();
      const summary: ProjectSummary = {
        id: input.id,
        name,
        createdAt: entries.get(input.id)?.summary.createdAt ?? now,
        updatedAt: now,
      };
      entries.set(input.id, { summary, document });
      return { ...summary };
    },

    async rename(id, name) {
      const normalized = normalizeProjectName(name);
      const entry = entries.get(id);
      if (!entry) throw missing(id);
      entry.summary = { ...entry.summary, name: normalized, updatedAt: clock.now() };
      return { ...entry.summary };
    },

    async duplicate(id, name) {
      const source = entries.get(id);
      if (!source) throw missing(id);
      const copyId = ProjectIdSchema.parse(idGen());
      const now = clock.now();
      const summary: ProjectSummary = {
        id: copyId,
        name: normalizeProjectName(name ?? copyProjectName(source.summary.name)),
        createdAt: now,
        updatedAt: now,
      };
      entries.set(copyId, { summary, document: copyOf(source.document) });
      return { ...summary };
    },

    async delete(id) {
      entries.delete(id);
    },
  };
}
