'use client';

import type { ShareErrorCode } from '@roomforge/core';
import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonVariants } from '@/ui/components/button';
import { type MessageKey, translate } from '@/ui/i18n';
import { repositoryErrorMessage } from '@/ui/projects/error-message';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

/**
 * The banner of the viewer of a shared link (P6-08): says the room is read-only and offers a copy
 * of it among the person's own projects. The copy rejects with the storage error to show.
 */
export function SharedViewBanner(props: { name: string; onCopy: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const copy = () => {
    setBusy(true);
    setProblem(undefined);
    props.onCopy().catch((error: unknown) => {
      setBusy(false);
      setProblem(repositoryErrorMessage(error));
    });
  };
  return (
    <section
      aria-labelledby="shared-view-title"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-2"
    >
      <Link href="/" className="rounded-sm font-semibold tracking-tight">
        {t('app.name')}
      </Link>
      <div className="min-w-0 flex-1">
        <h1 id="shared-view-title" className="font-medium text-sm">
          {t('viewer.title')}
        </h1>
        <p className="truncate text-fg-muted text-sm">{t('viewer.body', { name: props.name })}</p>
      </div>
      <Button size="sm" onClick={copy} disabled={busy} aria-busy={busy}>
        {t(busy ? 'viewer.copying' : 'viewer.copy')}
      </Button>
      {problem ? (
        <p role="alert" className="w-full text-destructive text-sm">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

const ERROR_KEYS: Partial<Record<ShareErrorCode, MessageKey>> = {
  EMPTY: 'viewer.error.empty',
  TOO_LARGE: 'viewer.error.tooLarge',
  NEWER_VERSION: 'viewer.error.newer',
  UNSUPPORTED: 'viewer.error.unsupported',
};

/** What the viewer shows for a link it cannot open: why, kindly, and a way into the app. */
export function SharedLinkUnavailable(props: { code: ShareErrorCode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="font-semibold text-2xl tracking-tight">{t('viewer.unavailableTitle')}</h1>
      <p role="alert" className="text-fg-muted">
        {t(ERROR_KEYS[props.code] ?? 'viewer.error.broken')}
      </p>
      <Link href="/projects/" className={buttonVariants()}>
        {t('viewer.toProjects')}
      </Link>
    </main>
  );
}
