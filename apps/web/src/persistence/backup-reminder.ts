import { type Clock, systemClock } from '@roomforge/core';
import type { KeyValueStorage } from './key-value-storage';

export const BACKUP_REMINDER_KEY = 'roomforge.backupReminder';

const DAY_MS = 24 * 60 * 60 * 1000;

interface ReminderState {
  /** Edits since the last export (or the last reminder). */
  edits: number;
  /** When counting started: the last export, the last reminder, or the first edit. */
  since: number | null;
  /** The person asked not to be reminded again. */
  never: boolean;
}

export interface BackupReminderOptions {
  storage: KeyValueStorage | undefined;
  clock?: Clock;
  /** Remind after this many edits without an export (default 200). */
  everyEdits?: number;
  /** ...or after this long with at least one edit and no export (default 7 days). */
  everyMs?: number;
}

/**
 * When to suggest exporting a copy (P6-09, RISKS R5): the browser's storage can be cleared, a file
 * cannot. Counts edits across visits in `localStorage`; due after `everyEdits` edits, or after
 * `everyMs` with some edit, since the last export or reminder. Never again once asked not to.
 */
export interface BackupReminder {
  /** Counts an edit; `true` when the reminder is due now (counting starts over). */
  recordEdit(): boolean;
  /** A copy was exported: counting starts over. */
  recordExport(): void;
  /** "Don't show again". */
  neverAgain(): void;
}

const MAX_STORED = 256;

/** What `localStorage` holds was written by this app, but may be damaged: anything odd is reset. */
function parse(raw: string | null): ReminderState {
  const fresh: ReminderState = { edits: 0, since: null, never: false };
  if (!raw || raw.length > MAX_STORED) return fresh;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof ReminderState, unknown>>;
    const edits = Number.isSafeInteger(value.edits) && (value.edits as number) >= 0;
    const since = value.since === null || Number.isFinite(value.since);
    if (!edits || !since || typeof value.never !== 'boolean') return fresh;
    return value as ReminderState;
  } catch {
    return fresh;
  }
}

export function createBackupReminder(options: BackupReminderOptions): BackupReminder {
  const { storage, clock = systemClock, everyEdits = 200, everyMs = 7 * DAY_MS } = options;

  function read(): ReminderState {
    try {
      return parse(storage?.getItem(BACKUP_REMINDER_KEY) ?? null);
    } catch {
      return parse(null);
    }
  }

  function write(state: ReminderState): void {
    try {
      storage?.setItem(BACKUP_REMINDER_KEY, JSON.stringify(state));
    } catch {
      // Full or blocked: the reminder is a courtesy, it just counts from scratch next time.
    }
  }

  return {
    recordEdit() {
      const state = read();
      if (state.never) return false;
      const now = clock.now();
      const since = state.since ?? now;
      const edits = state.edits + 1;
      const due = edits >= everyEdits || now - since >= everyMs;
      write(due ? { edits: 0, since: now, never: false } : { edits, since, never: false });
      return due;
    },
    recordExport() {
      const state = read();
      write({ edits: 0, since: clock.now(), never: state.never });
    },
    neverAgain() {
      write({ edits: 0, since: null, never: true });
    },
  };
}
