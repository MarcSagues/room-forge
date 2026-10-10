'use client';

import type { ImportError, RepositoryError } from '@roomforge/core';
import Link from 'next/link';
import { Button, buttonVariants } from '@/ui/components/button';
import { translate } from '@/ui/i18n';
import { repositoryErrorMessage } from '@/ui/projects/error-message';
import { importErrorMessage } from '@/ui/projects/import-error-message';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

/** Why the editor could not open the project it was asked for. */
export type ProjectUnavailableReason =
  | { kind: 'not-found' }
  | { kind: 'unreadable'; import: ImportError }
  | { kind: 'storage'; error: RepositoryError };

/**
 * What the editor shows instead of itself when its project cannot be opened: a missing project
 * (a deleted one, a wrong link), one stored in a way this version cannot read (nothing is changed),
 * or a storage that fails. Always with a way back to the projects.
 */
export function ProjectUnavailable(props: {
  reason: ProjectUnavailableReason;
  /** Offered for a storage failure, which may pass. */
  onRetry?: () => void;
}) {
  const { reason, onRetry } = props;
  const message =
    reason.kind === 'not-found'
      ? t('project.notFound')
      : reason.kind === 'unreadable'
        ? importErrorMessage(reason.import)
        : repositoryErrorMessage(reason.error);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="font-semibold text-2xl tracking-tight">{t('project.unavailableTitle')}</h1>
      <p role="alert" className="text-fg-muted">
        {message}
      </p>
      {reason.kind === 'unreadable' && reason.import.code !== 'NEWER_VERSION' ? (
        <p className="text-fg-muted text-sm">{t('project.unreadable')}</p>
      ) : null}
      <div className="flex gap-2">
        <Link href="/projects/" prefetch={false} className={buttonVariants()}>
          {t('project.back')}
        </Link>
        {reason.kind === 'storage' && onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {t('project.retry')}
          </Button>
        ) : null}
      </div>
    </main>
  );
}
