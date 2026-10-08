import type { Patch } from 'immer';
import type { Clock } from '../ports';

export interface HistoryEntry {
  readonly label: string;
  readonly patches: readonly Patch[];
  readonly inverse: readonly Patch[];
  readonly mergeKey?: string;
  /** Time of the last command merged into this entry. */
  readonly at: number;
}

export interface HistoryStatus {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
}

export interface HistoryOptions {
  clock: Clock;
  /** Maximum number of entries; the oldest are dropped (ARCHITECTURE §4.4). */
  limit?: number;
  /** Consecutive commands with the same `mergeKey` closer than this are coalesced. */
  mergeWindowMs?: number;
}

export const DEFAULT_HISTORY_LIMIT = 200;
export const DEFAULT_MERGE_WINDOW_MS = 600;

export interface History {
  /** Records a change; it may be merged into the previous entry (see `mergeWindowMs`). */
  push(entry: Omit<HistoryEntry, 'at'>): void;
  /** Returns the entry whose `inverse` must be applied, or `undefined` if there is nothing to undo. */
  undo(): HistoryEntry | undefined;
  /** Returns the entry whose `patches` must be applied, or `undefined` if there is nothing to redo. */
  redo(): HistoryEntry | undefined;
  status(): HistoryStatus;
  size(): number;
  clear(): void;
}

/** Undo/redo stacks of Immer patches. Pure bookkeeping: the session applies the patches. */
export function createHistory(options: HistoryOptions): History {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  const mergeWindowMs = options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;
  let done: HistoryEntry[] = [];
  let undone: HistoryEntry[] = [];
  // Only the entry produced by the latest push may absorb the next one (not one brought back by redo).
  let mergeable = false;

  return {
    push(next) {
      const now = options.clock.now();
      undone = [];
      const top = done.at(-1);
      if (
        mergeable &&
        top &&
        next.mergeKey !== undefined &&
        top.mergeKey === next.mergeKey &&
        now - top.at <= mergeWindowMs
      ) {
        done[done.length - 1] = {
          ...top,
          patches: [...top.patches, ...next.patches],
          inverse: [...next.inverse, ...top.inverse],
          at: now,
        };
      } else {
        done.push({ ...next, at: now });
        if (done.length > limit) done = done.slice(done.length - limit);
      }
      mergeable = true;
    },
    undo() {
      const entry = done.pop();
      if (entry) undone.push(entry);
      mergeable = false;
      return entry;
    },
    redo() {
      const entry = undone.pop();
      if (entry) done.push(entry);
      mergeable = false;
      return entry;
    },
    status() {
      return {
        canUndo: done.length > 0,
        canRedo: undone.length > 0,
        undoLabel: done.at(-1)?.label ?? null,
        redoLabel: undone.at(-1)?.label ?? null,
      };
    },
    size: () => done.length,
    clear() {
      done = [];
      undone = [];
      mergeable = false;
    },
  };
}
