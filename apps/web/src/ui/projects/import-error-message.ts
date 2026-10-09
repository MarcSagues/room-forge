import type { ImportError, ImportErrorCode } from '@roomforge/core';
import { type MessageKey, translate } from '@/ui/i18n';

const KEYS: Record<ImportErrorCode, MessageKey> = {
  TOO_LARGE: 'projects.importError.tooLarge',
  INVALID_JSON: 'projects.importError.invalidJson',
  HOSTILE_INPUT: 'projects.importError.hostileInput',
  NOT_A_PROJECT: 'projects.importError.notAProject',
  NEWER_VERSION: 'projects.importError.newerVersion',
  INVALID_VERSION: 'projects.importError.invalidVersion',
  MIGRATION_FAILED: 'projects.importError.migrationFailed',
  INVALID_DOCUMENT: 'projects.importError.invalidDocument',
  INVARIANT_VIOLATION: 'projects.importError.invariantViolation',
};

/** The sentence for a file that could not be opened: by its code, never by its English message. */
export function importErrorMessage(error: ImportError): string {
  return translate('en', KEYS[error.code]);
}
