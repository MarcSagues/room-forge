import { RepositoryError } from '@roomforge/core';

/** Legacy `DOMException.code` values browsers still use for a full disk (Safari, old Firefox). */
const QUOTA_CODES = new Set([22, 1014]);

function nameOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
}

function codeOf(error: unknown): number | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number'
    ? error.code
    : undefined;
}

/**
 * Turns whatever IndexedDB threw into a `RepositoryError` the UI can choose a message for. While the
 * database is being opened, almost any failure means "there is no storage here" (private mode,
 * blocked site data, a corrupted profile); once it is open, only the listed names mean something.
 */
export function toRepositoryError(error: unknown, phase: 'open' | 'operation'): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const name = nameOf(error);
  const code = codeOf(error);
  if (name === 'QuotaExceededError' || (code !== undefined && QUOTA_CODES.has(code))) {
    return new RepositoryError('QUOTA_EXCEEDED', 'The browser has no storage left for this', {
      cause: error,
    });
  }
  if (name === 'VersionError') {
    return new RepositoryError(
      'VERSION_ERROR',
      'The stored projects were written by a newer version of the app',
      { cause: error },
    );
  }
  if (phase === 'open' && ['SecurityError', 'InvalidStateError', 'UnknownError'].includes(name)) {
    return new RepositoryError('UNAVAILABLE', 'The browser does not allow storing projects here', {
      cause: error,
    });
  }
  if (name === 'DataCloneError') {
    return new RepositoryError('FAILED', 'The project holds something that cannot be stored', {
      cause: error,
    });
  }
  return new RepositoryError(
    'FAILED',
    phase === 'open'
      ? 'The project database could not be opened'
      : 'The project could not be saved',
    { cause: error },
  );
}
