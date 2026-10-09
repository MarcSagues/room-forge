import { type Clock, type SceneDocument, systemClock } from '@roomforge/core';
import type { KeyValueStorage } from './key-value-storage';

/** What was written down about a project when the page was going away. */
export interface JournalEntry {
  name: string;
  document: SceneDocument;
  /** When it was written (the clock's ms): newer than the last save means it holds unsaved work. */
  at: number;
}

/**
 * A synchronous safety net for the moment a page goes away (P6-03). IndexedDB cannot be trusted
 * there: the browser aborts a page's transactions when it unloads, so a write queued by `pagehide`
 * may never land. `localStorage` is synchronous and survives, so the document is written there
 * first; autosave clears it once the real write succeeded, and the next visit recovers whatever is
 * left. One entry per project; a damaged one is the same as none.
 */
export interface Journal {
  /** Writes the entry; `false` when it could not be (storage full or blocked). Never throws. */
  write(projectId: string, name: string, document: SceneDocument): boolean;
  read(projectId: string): JournalEntry | null;
  clear(projectId: string): void;
}

const VERSION = 1;

export const journalKey = (projectId: string) => `roomforge.journal.${projectId}`;

export function createLocalStorageJournal(
  storage: KeyValueStorage | undefined,
  clock: Clock = systemClock,
): Journal {
  return {
    write(projectId, name, document) {
      if (!storage) return false;
      try {
        storage.setItem(
          journalKey(projectId),
          JSON.stringify({ v: VERSION, name, at: clock.now(), document }),
        );
        return true;
      } catch {
        // Full or blocked: autosave still tries IndexedDB, which is all there is.
        return false;
      }
    },
    read(projectId) {
      if (!storage) return null;
      let text: string | null;
      try {
        text = storage.getItem(journalKey(projectId));
      } catch {
        return null;
      }
      if (text === null) return null;
      try {
        const value: unknown = JSON.parse(text);
        if (
          typeof value === 'object' &&
          value !== null &&
          (value as { v?: unknown }).v === VERSION &&
          typeof (value as { name?: unknown }).name === 'string' &&
          typeof (value as { at?: unknown }).at === 'number' &&
          typeof (value as { document?: unknown }).document === 'object' &&
          (value as { document?: unknown }).document !== null
        ) {
          const { name, at, document } = value as {
            name: string;
            at: number;
            document: SceneDocument;
          };
          return { name, at, document };
        }
      } catch {
        // Falls through: damaged.
      }
      // Not something this version wrote (or cut short): it is of no use, and in the way.
      this.clear(projectId);
      return null;
    },
    clear(projectId) {
      try {
        storage?.removeItem(journalKey(projectId));
      } catch {
        // Nothing to do about it.
      }
    },
  };
}
