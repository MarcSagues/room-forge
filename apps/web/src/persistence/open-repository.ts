import { type ProjectRepository, RepositoryError } from '@roomforge/core';
import { toRepositoryError } from './errors';
import {
  createIndexedDbProjectRepository,
  type IndexedDbRepositoryOptions,
  type StorageManagerLike,
} from './indexeddb-repository';
import { createMemoryProjectRepository } from './memory-repository';

export interface OpenedRepository {
  repository: ProjectRepository;
  /**
   * `indexeddb` where the browser keeps the projects; `memory` where it does not: they then last
   * only until the tab closes, and the person has to be told.
   */
  mode: 'indexeddb' | 'memory';
  /** Why there is no storage; set exactly when `mode` is `memory`. */
  problem?: RepositoryError;
  /** Lets go of the database connection (a screen that opened it closes it when it goes away). */
  close(): Promise<void>;
}

function browserStorageManager(): StorageManagerLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const manager = navigator.storage as StorageManagerLike | undefined;
  return typeof manager?.persist === 'function' ? manager : undefined;
}

/**
 * The app's `ProjectRepository`: IndexedDB when the browser allows it (it is opened right away, so
 * a browser that does not is found out now and not at the first save), and an in-memory one,
 * with the reason, when it does not. The app keeps working in both cases.
 */
export async function openProjectRepository(
  options: IndexedDbRepositoryOptions = {},
): Promise<OpenedRepository> {
  const { storageManager = browserStorageManager(), ...rest } = options;
  const stored = createIndexedDbProjectRepository({ ...rest, storageManager });
  try {
    await stored.list();
    return { repository: stored, mode: 'indexeddb', close: () => stored.close() };
  } catch (error) {
    await stored.close();
    const { clock, idGen } = rest;
    return {
      repository: createMemoryProjectRepository({
        ...(clock ? { clock } : {}),
        ...(idGen ? { idGen } : {}),
      }),
      mode: 'memory',
      close: async () => {},
      problem: error instanceof RepositoryError ? error : toRepositoryError(error, 'open'),
    };
  }
}
