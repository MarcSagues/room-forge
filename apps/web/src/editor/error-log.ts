/**
 * The local error log (P7-08): the last 50 errors with their stack, kept in this browser only, so a
 * crash can be reported and an error that happened before a reload is still there afterwards. It
 * never holds project data: only what went wrong and where.
 */

export type ErrorSource = 'react' | 'window' | 'promise' | 'webgl';

export interface ErrorEntry {
  /** ISO 8601. */
  time: string;
  source: ErrorSource;
  message: string;
  stack?: string;
  /** Where in the app it happened (a panel name). */
  where?: string;
}

/** The part of `Storage` the log uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ERROR_LOG_LIMIT = 50;
export const ERROR_LOG_KEY = 'roomforge.errors';

const MAX_MESSAGE = 500;
const MAX_STACK_LINES = 20;
const MAX_STACK = 4000;
const SOURCES: readonly ErrorSource[] = ['react', 'window', 'promise', 'webgl'];

export interface ErrorLog {
  record(error: unknown, meta?: { source?: ErrorSource; where?: string }): void;
  /** Oldest first. */
  entries(): readonly ErrorEntry[];
  clear(): void;
  /** A plain-text report for download; `header` lines (app version...) go first. */
  toText(header?: Record<string, string>): string;
}

export interface ErrorLogOptions {
  /** Where entries survive a reload; none = memory only. */
  storage?: StorageLike;
  now?: () => string;
  limit?: number;
}

function describe(thrown: unknown): { message: string; stack?: string } {
  try {
    if (thrown instanceof Error) {
      const message = `${thrown.name}: ${thrown.message}`;
      return thrown.stack ? { message, stack: thrown.stack } : { message };
    }
    if (typeof thrown === 'string') return { message: thrown };
    if (typeof thrown === 'object' && thrown !== null && 'message' in thrown) {
      const { message, stack } = thrown as { message: unknown; stack?: unknown };
      return typeof stack === 'string'
        ? { message: String(message), stack }
        : { message: String(message) };
    }
    return { message: String(thrown) };
  } catch {
    return { message: 'An error that could not be described' };
  }
}

function shorten(entry: { message: string; stack?: string }): { message: string; stack?: string } {
  const message = entry.message.slice(0, MAX_MESSAGE);
  if (entry.stack === undefined) return { message };
  const stack = entry.stack.split('\n').slice(0, MAX_STACK_LINES).join('\n').slice(0, MAX_STACK);
  return { message, stack };
}

function isEntry(value: unknown): value is ErrorEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.time === 'string' &&
    typeof entry.message === 'string' &&
    typeof entry.source === 'string' &&
    (SOURCES as readonly string[]).includes(entry.source)
  );
}

export function createErrorLog(options: ErrorLogOptions = {}): ErrorLog {
  const { storage } = options;
  const limit = options.limit ?? ERROR_LOG_LIMIT;
  const now = options.now ?? (() => new Date().toISOString());

  let entries: ErrorEntry[] = [];
  try {
    const raw = storage?.getItem(ERROR_LOG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) entries = parsed.filter(isEntry).slice(-limit);
  } catch {
    // Blocked or corrupted storage: start with an empty log.
  }

  const save = () => {
    try {
      storage?.setItem(ERROR_LOG_KEY, JSON.stringify(entries));
    } catch {
      // Full or blocked: the log still works in memory.
    }
  };

  return {
    record(error, meta = {}) {
      const { message, stack } = shorten(describe(error));
      const entry: ErrorEntry = {
        time: now(),
        source: meta.source ?? 'window',
        message,
        ...(stack ? { stack } : {}),
        ...(meta.where ? { where: meta.where } : {}),
      };
      entries = [...entries, entry].slice(-limit);
      save();
    },
    entries: () => entries,
    clear() {
      entries = [];
      try {
        storage?.removeItem(ERROR_LOG_KEY);
      } catch {
        // Nothing to do: the in-memory log is already empty.
      }
    },
    toText(header = {}) {
      const lines = ['RoomForge error log'];
      for (const [name, value] of Object.entries(header)) lines.push(`${name}: ${value}`);
      lines.push('This report does not contain your project: only what went wrong and where.', '');
      if (entries.length === 0) lines.push('No errors recorded.');
      for (const entry of entries) {
        const place = entry.where ? ` ${entry.where}` : '';
        lines.push(`${entry.time} [${entry.source}]${place}`, entry.message);
        if (entry.stack) lines.push(entry.stack);
        lines.push('');
      }
      return lines.join('\n');
    },
  };
}

/** Records what the page itself would lose: uncaught errors and unhandled rejections. */
export function installErrorCapture(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  log: Pick<ErrorLog, 'record'>,
): () => void {
  const record = (error: unknown, source: ErrorSource) => {
    try {
      log.record(error, { source });
    } catch {
      // Reporting an error must never cause another one.
    }
  };
  const onError = (event: Event) => {
    const { error, message } = event as ErrorEvent;
    record(error ?? message, 'window');
  };
  const onRejection = (event: Event) => record((event as PromiseRejectionEvent).reason, 'promise');
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
