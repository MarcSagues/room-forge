import { LIMITS, RepositoryError, type RepositoryErrorCode } from '@roomforge/core';
import { type MessageKey, translate } from '@/ui/i18n';

const KEYS: Record<RepositoryErrorCode, MessageKey> = {
  QUOTA_EXCEEDED: 'projects.error.quota',
  BLOCKED: 'projects.error.blocked',
  VERSION_ERROR: 'projects.error.versionError',
  UNAVAILABLE: 'projects.error.unavailable',
  NOT_FOUND: 'projects.error.notFound',
  INVALID_NAME: 'projects.error.invalidName',
  FAILED: 'projects.error.failed',
};

/** The sentence for a storage failure: chosen by its code, never by its (English) message. */
export function repositoryErrorMessage(error: unknown): string {
  const key = error instanceof RepositoryError ? KEYS[error.code] : 'projects.error.failed';
  return translate('en', key, { max: LIMITS.maxNameLength });
}
