import {
  type Clock,
  type ProjectId,
  type ProjectRepository,
  type RepositoryError,
  type SceneDocument,
  systemClock,
} from '@roomforge/core';
import { toRepositoryError } from './errors';
import type { Journal } from './journal';

/** Where the work stands: nothing to save, a change waiting, a write going, or a write that failed. */
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

/** A new object whenever anything changes, so a UI store can compare it by identity. */
export interface SaveState {
  readonly status: SaveStatus;
  /** When the last successful write finished (the clock's ms), or `null` before the first one. */
  readonly lastSavedAt: number | null;
  /** Why the last attempt failed, while `status` is `error`. */
  readonly error: RepositoryError | null;
  /** Failed attempts in a row. */
  readonly failures: number;
}

/** Timers, injectable: tests pass one on a fake clock. */
export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemScheduler: Scheduler = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** What autosave watches: the document, and when it changes. */
export interface AutosaveSource {
  /** The document as it is now. Immutable: it is a different object whenever it changes. */
  document(): SceneDocument;
  /** Calls `listener` after every change of the document; returns how to stop. */
  onChange(listener: () => void): () => void;
}

export interface AutosaveOptions {
  repository: ProjectRepository;
  projectId: ProjectId;
  /** The name the project is saved under, read at the time of each write. */
  name: () => string;
  source: AutosaveSource;
  clock?: Clock;
  scheduler?: Scheduler;
  /** Quiet time after the last change before writing (default 1.5 s). */
  debounceMs?: number;
  /** Longest a change may wait, however much more is done meanwhile (default 10 s). */
  maxWaitMs?: number;
  /** Retry delays after a failure: `first`, doubling, up to `max` (default 2 s to 30 s). */
  retryMs?: { first: number; max: number };
  /** Where unsaved work is written down, synchronously, when the page is going away. */
  journal?: Journal;
}

export interface Autosave {
  state(): SaveState;
  /** Calls `listener` with every new state (not with the current one). */
  subscribe(listener: (state: SaveState) => void): () => void;
  /** Writes what is not saved right now (the page is hiding or closing); never rejects. */
  flush(): Promise<void>;
  /**
   * Writes the unsaved document to the journal, synchronously (the page is going away: this is the
   * one write that is certain to land). Autosave clears it when the real write succeeds.
   */
  journalNow(): void;
  /** Tries again at once after a failure; never rejects. */
  retry(): Promise<void>;
  /** Stops listening and cancels timers; with `flush`, saves what is pending first. */
  dispose(options?: { flush?: boolean }): Promise<void>;
}

const DEFAULT_RETRY = { first: 2_000, max: 30_000 } as const;

/**
 * Saves the document in the background (ARCHITECTURE §8). A change starts a countdown that every
 * further change restarts, but never past `maxWaitMs` since the first unsaved one, so a long run of
 * editing is still saved now and then. One write at a time: a change made during a write is written
 * right after it, so nothing is lost and nothing is written twice at once. A failed write is
 * reported and retried with growing delays; the work is never dropped. The session only publishes
 * a gesture's result when it ends, so a drag is saved once, not on every step.
 */
export function createAutosave(options: AutosaveOptions): Autosave {
  const {
    repository,
    projectId,
    name,
    source,
    clock = systemClock,
    scheduler = systemScheduler,
    debounceMs = 1_500,
    maxWaitMs = 10_000,
    retryMs = DEFAULT_RETRY,
    journal,
  } = options;

  let state: SaveState = { status: 'saved', lastSavedAt: null, error: null, failures: 0 };
  // What the repository holds, as far as we know: the document it was last given (or opened from).
  let savedDocument = source.document();
  let firstUnsavedAt: number | null = null;
  let lastChangeAt = 0;
  let timer: unknown;
  let inFlight: Promise<void> | undefined;
  let disposed = false;
  const listeners = new Set<(state: SaveState) => void>();

  function set(patch: Partial<SaveState>): void {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener(state);
  }

  function clearTimer(): void {
    if (timer !== undefined) scheduler.clearTimeout(timer);
    timer = undefined;
  }

  function after(delay: number): void {
    clearTimer();
    timer = scheduler.setTimeout(
      () => {
        timer = undefined;
        void run();
      },
      Math.max(0, delay),
    );
  }

  function scheduleSave(): void {
    const now = clock.now();
    const due = Math.min(lastChangeAt + debounceMs, (firstUnsavedAt ?? now) + maxWaitMs);
    after(due - now);
  }

  function scheduleRetry(failures: number): void {
    after(Math.min(retryMs.first * 2 ** (failures - 1), retryMs.max));
  }

  async function write(document: SceneDocument): Promise<void> {
    try {
      await repository.save({ id: projectId, name: name(), document });
      savedDocument = document;
      const changedMeanwhile = source.document() !== document;
      firstUnsavedAt = changedMeanwhile ? clock.now() : null;
      // Written for good: whatever the journal held is no longer needed (unless more came since).
      if (!changedMeanwhile) journal?.clear(projectId);
      set({
        status: changedMeanwhile ? 'dirty' : 'saved',
        lastSavedAt: clock.now(),
        error: null,
        failures: 0,
      });
      if (changedMeanwhile && !disposed) scheduleSave();
    } catch (error) {
      const failures = state.failures + 1;
      set({ status: 'error', error: toRepositoryError(error, 'operation'), failures });
      if (!disposed) scheduleRetry(failures);
    }
  }

  async function run(): Promise<void> {
    if (disposed) return;
    if (inFlight) {
      await inFlight;
      return;
    }
    clearTimer();
    const document = source.document();
    if (document === savedDocument && state.status !== 'error') {
      firstUnsavedAt = null;
      if (state.status !== 'saved') set({ status: 'saved' });
      return;
    }
    set({ status: 'saving' });
    const attempt = write(document);
    inFlight = attempt;
    try {
      await attempt;
    } finally {
      inFlight = undefined;
    }
  }

  const stopWatching = source.onChange(() => {
    if (disposed) return;
    const now = clock.now();
    lastChangeAt = now;
    firstUnsavedAt ??= now;
    if (state.status === 'saved') set({ status: 'dirty' });
    // While a write is going, or failing, the end of that write decides what comes next.
    if (state.status === 'dirty') scheduleSave();
  });

  async function flush(): Promise<void> {
    if (disposed) return;
    clearTimer();
    // A write in progress is waited for; what changed during it is written too.
    for (let round = 0; round < 5 && !disposed; round += 1) {
      if (inFlight) await inFlight;
      if (state.status === 'saved') return;
      await run();
      if (state.status === 'error') return;
    }
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    journalNow() {
      if (disposed || !journal) return;
      const document = source.document();
      if (document !== savedDocument) journal.write(projectId, name(), document);
    },
    flush,
    retry: flush,
    async dispose(disposeOptions = {}) {
      if (disposeOptions.flush) await flush();
      disposed = true;
      clearTimer();
      stopWatching();
      listeners.clear();
    },
  };
}
