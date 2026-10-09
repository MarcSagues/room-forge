import { type ProjectSummary, RepositoryError, type SceneDocument } from '@roomforge/core';
import { type DBSchema, type IDBPDatabase, type IDBPTransaction, openDB } from 'idb';
import { toRepositoryError } from './errors';

export const DATABASE_NAME = 'roomforge';

/** Shape of database version 1 (ARCHITECTURE §8). */
export interface RoomForgeDb extends DBSchema {
  /** Metadata of each project: what the list needs, without the document. */
  projects: { key: string; value: ProjectSummary };
  documents: { key: string; value: { id: string; document: SceneDocument } };
  /** Flags of the app itself (such as whether persistent storage was granted). */
  meta: { key: string; value: unknown };
}

export type UpgradeTransaction = IDBPTransaction<unknown, string[], 'versionchange'>;
/** One step of the database schema: the step at index `n` takes it from version `n` to `n + 1`. */
export type UpgradeStep = (db: IDBPDatabase<unknown>, transaction: UpgradeTransaction) => void;

/**
 * Append only: a step that has shipped is never edited, so a person who skipped a version still
 * ends up with the same schema. The database version is the number of steps.
 */
export const UPGRADE_STEPS: readonly UpgradeStep[] = [
  (db) => {
    db.createObjectStore('projects', { keyPath: 'id' });
    db.createObjectStore('documents', { keyPath: 'id' });
    db.createObjectStore('meta');
  },
];

export interface OpenOptions {
  name?: string;
  steps?: readonly UpgradeStep[];
  /** Called when a newer tab needs this connection closed to upgrade the database. */
  onClosed?: () => void;
}

/**
 * Opens (and, if needed, upgrades) the database. Rejects with a typed `RepositoryError`: `BLOCKED`
 * when another tab keeps an old connection open and the upgrade cannot go on, `VERSION_ERROR` when
 * the database on disk is newer than this code, `UNAVAILABLE` when there is no IndexedDB here.
 */
export function openProjectDatabase({
  name = DATABASE_NAME,
  steps = UPGRADE_STEPS,
  onClosed,
}: OpenOptions = {}): Promise<IDBPDatabase<RoomForgeDb>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new RepositoryError('UNAVAILABLE', 'This browser has no IndexedDB'));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let opened: Promise<IDBPDatabase<RoomForgeDb>>;
    try {
      opened = openDB<RoomForgeDb>(name, steps.length, {
        upgrade(db, oldVersion, _newVersion, transaction) {
          // If a step throws, the browser aborts the upgrade and `done` rejects; the failure is
          // reported through the open request, so this one must not be left unhandled.
          transaction.done.catch(() => {});
          for (let version = oldVersion; version < steps.length; version += 1) {
            steps[version]?.(
              db as unknown as IDBPDatabase<unknown>,
              transaction as unknown as UpgradeTransaction,
            );
          }
        },
        blocked() {
          if (settled) return;
          settled = true;
          reject(
            new RepositoryError(
              'BLOCKED',
              'Another tab is using an older version of the app: close it and try again',
            ),
          );
        },
        blocking() {
          // A newer tab wants to upgrade: let it. The next operation here opens the database again.
          void opened.then((db) => {
            db.close();
            onClosed?.();
          });
        },
        terminated() {
          onClosed?.();
        },
      });
    } catch (error) {
      reject(toRepositoryError(error, 'open'));
      return;
    }
    opened.then(
      (db) => {
        if (settled) {
          // The attempt was reported as blocked; the connection that arrived late is not wanted.
          db.close();
          return;
        }
        settled = true;
        resolve(db);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(toRepositoryError(error, 'open'));
      },
    );
  });
}
