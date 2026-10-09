'use client';

import type { RepositoryErrorCode } from '@roomforge/core';
import { Button } from '@/ui/components/button';
import { type MessageKey, translate } from '@/ui/i18n';

const t = (key: MessageKey) => translate('en', key);

/** What is wrong with keeping the work: a write that failed, or no storage to write to at all. */
export type SaveProblem = { kind: 'failed'; code: RepositoryErrorCode } | { kind: 'memory' };

const FAILED_MESSAGES: Record<RepositoryErrorCode, MessageKey> = {
  QUOTA_EXCEEDED: 'save.failed.quota',
  UNAVAILABLE: 'save.failed.unavailable',
  BLOCKED: 'save.failed.blocked',
  VERSION_ERROR: 'save.failed.versionError',
  NOT_FOUND: 'save.failed.generic',
  INVALID_NAME: 'save.failed.generic',
  FAILED: 'save.failed.generic',
};

/**
 * A persistent notice over the viewport while the person's work is not being kept: either the
 * latest write failed (autosave keeps trying) or the browser stores nothing. In both cases there is
 * a way out, "Export a copy", that does not depend on storage.
 */
export function SaveNotice(props: {
  problem: SaveProblem | null;
  onRetry?: () => void;
  onExport?: () => void;
}) {
  const { problem, onRetry, onExport } = props;
  if (!problem) return null;
  const memory = problem.kind === 'memory';
  const showRetry = !memory && onRetry !== undefined;
  return (
    <div
      role="alert"
      className="absolute top-3 left-1/2 z-10 flex w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-lg border border-danger bg-card px-4 py-3 text-sm shadow-md"
    >
      <p className="font-medium">{t(memory ? 'save.memoryTitle' : 'save.failedTitle')}</p>
      <p className="text-fg-muted">
        {t(memory ? 'save.memoryBody' : FAILED_MESSAGES[problem.code])}
      </p>
      {showRetry || onExport ? (
        <div className="flex gap-2">
          {showRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              {t('save.retry')}
            </Button>
          ) : null}
          {onExport ? (
            <Button size="sm" onClick={onExport}>
              {t('save.export')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
