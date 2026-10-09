import {
  type Clock,
  copyProjectName,
  createNanoIdGen,
  type IdGen,
  normalizeProjectName,
  type ProjectId,
  ProjectIdSchema,
  type ProjectInput,
  type ProjectRepository,
  type ProjectSummary,
  RepositoryError,
  type StoredProject,
  systemClock,
} from '@roomforge/core';
import type { IDBPDatabase, IDBPTransaction } from 'idb';
import { type OpenOptions, openProjectDatabase, type RoomForgeDb } from './database';
import { toRepositoryError } from './errors';

/** The part of `navigator.storage` this needs; injectable so tests do not depend on a browser. */
export interface StorageManagerLike {
  persist(): Promise<boolean>;
}

export interface IndexedDbRepositoryOptions extends Omit<OpenOptions, 'onClosed'> {
  clock?: Clock;
  idGen?: IdGen;
  /**
   * Asked once, after the first successful save, to keep the browser from evicting the projects.
   * Not at startup: some browsers show a permission prompt for it, which belongs after the person
   * has made something worth keeping.
   */
  storageManager?: StorageManagerLike | undefined;
}

export interface IndexedDbProjectRepository extends ProjectRepository {
  /** Reads a flag of the app itself (`undefined` when it was never written). */
  getMeta(key: string): Promise<unknown>;
  setMeta(key: string, value: unknown): Promise<void>;
  /** Closes the connection; the next operation opens it again. */
  close(): Promise<void>;
}

type Stores = ['projects', 'documents'];
type Tx<Mode extends IDBTransactionMode> = IDBPTransaction<RoomForgeDb, Stores, Mode>;

/** Key in the `meta` store with the answer to `navigator.storage.persist()`. */
export const PERSISTED_KEY = 'persisted';

function summaryOf(project: ProjectSummary): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Newest first, so the project the person worked on last opens first. */
function newestFirst(a: ProjectSummary, b: ProjectSummary): number {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
}

/**
 * Projects in IndexedDB (ADR-0004). Every write is one transaction over both stores, so there is
 * never a project without its document or a document without its project: if anything fails, the
 * transaction is aborted and the browser discards what was queued.
 */
export function createIndexedDbProjectRepository(
  options: IndexedDbRepositoryOptions = {},
): IndexedDbProjectRepository {
  const {
    clock = systemClock,
    idGen = createNanoIdGen(),
    storageManager,
    ...openOptions
  } = options;
  let connection: Promise<IDBPDatabase<RoomForgeDb>> | undefined;
  let persistenceAsked = false;
  // When each project was created, learned from what this repository has listed, read or written.
  // Saving a project whose date is known needs no read first, so its writes are queued at once:
  // a page that is being closed can still hand them over before it goes (see `save`).
  const createdAt = new Map<string, number>();

  function database(): Promise<IDBPDatabase<RoomForgeDb>> {
    if (!connection) {
      const attempt = openProjectDatabase({
        ...openOptions,
        onClosed: () => {
          connection = undefined;
        },
      });
      connection = attempt;
      attempt.catch(() => {
        // A failed attempt is not cached: the next call tries again (the other tab may be gone).
        if (connection === attempt) connection = undefined;
      });
    }
    return connection;
  }

  /** Runs `work` in one transaction; on any failure aborts it and reports a typed error. */
  async function transact<Mode extends IDBTransactionMode, T>(
    mode: Mode,
    work: (tx: Tx<Mode>) => Promise<T>,
  ): Promise<T> {
    const db = await database();
    let tx: Tx<Mode>;
    try {
      tx = db.transaction(['projects', 'documents'], mode) as Tx<Mode>;
    } catch (error) {
      throw toRepositoryError(error, 'operation');
    }
    // Rejects on abort; whoever awaits `tx.done` below sees it, the rest must not trip over it.
    tx.done.catch(() => {});
    try {
      const result = await work(tx);
      await tx.done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Already finished or aborted by the browser: nothing left to undo.
      }
      throw toRepositoryError(error, 'operation');
    }
  }

  /**
   * Starts every operation inside the transaction and waits for all of them. If starting one throws
   * (a value that cannot be cloned), the ones already queued are aborted with the transaction and
   * reject; nobody awaits them any more, so they are marked as handled.
   */
  async function together(...operations: Array<() => Promise<unknown>>): Promise<void> {
    const started: Promise<unknown>[] = [];
    try {
      for (const start of operations) started.push(start());
    } finally {
      for (const request of started) request.catch(() => {});
    }
    await Promise.all(started);
  }

  function askForPersistence(): void {
    if (persistenceAsked || !storageManager) return;
    persistenceAsked = true;
    void storageManager
      .persist()
      .then((granted) => repository.setMeta(PERSISTED_KEY, { granted, at: clock.now() }))
      .catch(() => {
        // Persistence is a courtesy: failing to ask or to note the answer changes nothing else.
      });
  }

  const repository: IndexedDbProjectRepository = {
    async list() {
      const db = await database();
      try {
        const all = await db.getAll('projects');
        for (const project of all) createdAt.set(project.id, project.createdAt);
        return all.map(summaryOf).sort(newestFirst);
      } catch (error) {
        throw toRepositoryError(error, 'operation');
      }
    },

    async get(id) {
      return transact('readonly', async (tx) => {
        const [summary, stored] = await Promise.all([
          tx.objectStore('projects').get(id),
          tx.objectStore('documents').get(id),
        ]);
        if (!summary || !stored) return undefined;
        createdAt.set(summary.id, summary.createdAt);
        return { ...summaryOf(summary), document: stored.document } satisfies StoredProject;
      });
    },

    async save(input: ProjectInput) {
      const name = normalizeProjectName(input.name);
      const saved = await transact('readwrite', async (tx) => {
        const projects = tx.objectStore('projects');
        // Known date: no read, so both writes below are queued before anything has to finish.
        const known = createdAt.get(input.id);
        const existing = known === undefined ? await projects.get(input.id) : undefined;
        const now = clock.now();
        const summary: ProjectSummary = {
          id: input.id,
          name,
          createdAt: known ?? existing?.createdAt ?? now,
          updatedAt: now,
        };
        // Both puts are queued before the transaction can commit; a failure in either aborts all.
        await together(
          () => projects.put(summary),
          () => tx.objectStore('documents').put({ id: input.id, document: input.document }),
        );
        return summary;
      });
      createdAt.set(saved.id, saved.createdAt);
      askForPersistence();
      return saved;
    },

    async rename(id, name) {
      const normalized = normalizeProjectName(name);
      return transact('readwrite', async (tx) => {
        const projects = tx.objectStore('projects');
        const existing = await projects.get(id);
        if (!existing) throw new RepositoryError('NOT_FOUND', `There is no project ${id}`);
        const summary = { ...summaryOf(existing), name: normalized, updatedAt: clock.now() };
        await projects.put(summary);
        createdAt.set(summary.id, summary.createdAt);
        return summary;
      });
    },

    async duplicate(id, name) {
      return transact('readwrite', async (tx) => {
        const [source, stored] = await Promise.all([
          tx.objectStore('projects').get(id),
          tx.objectStore('documents').get(id),
        ]);
        if (!source || !stored) throw new RepositoryError('NOT_FOUND', `There is no project ${id}`);
        const copyId: ProjectId = ProjectIdSchema.parse(idGen());
        const now = clock.now();
        const summary: ProjectSummary = {
          id: copyId,
          name: normalizeProjectName(name ?? copyProjectName(source.name)),
          createdAt: now,
          updatedAt: now,
        };
        await together(
          () => tx.objectStore('projects').put(summary),
          () => tx.objectStore('documents').put({ id: copyId, document: stored.document }),
        );
        createdAt.set(summary.id, summary.createdAt);
        return summary;
      });
    },

    async delete(id) {
      await transact('readwrite', async (tx) => {
        await together(
          () => tx.objectStore('projects').delete(id),
          () => tx.objectStore('documents').delete(id),
        );
      });
      createdAt.delete(id);
    },

    async getMeta(key) {
      const db = await database();
      try {
        return await db.get('meta', key);
      } catch (error) {
        throw toRepositoryError(error, 'operation');
      }
    },

    async setMeta(key, value) {
      const db = await database();
      try {
        await db.put('meta', value, key);
      } catch (error) {
        throw toRepositoryError(error, 'operation');
      }
    },

    async close() {
      const pending = connection;
      connection = undefined;
      if (pending) (await pending.catch(() => undefined))?.close();
    },
  };
  return repository;
}
