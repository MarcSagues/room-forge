'use client';

import { AlertTriangleIcon } from 'lucide-react';
import { Button } from '@/ui/components/button';
import { type MessageKey, translate } from '@/ui/i18n';
import { buildReportUrl } from './report';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

function reportLink(error: Error, where: string | undefined, appVersion: string) {
  return buildReportUrl({
    message: `${error.name}: ${error.message}`,
    appVersion,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    ...(error.stack ? { stack: error.stack } : {}),
    ...(where ? { where } : {}),
  });
}

interface FailureProps {
  error: Error;
  onRetry(): void;
  where?: string;
  /** Shown in the report; defaults to "unknown". */
  appVersion?: string;
}

/**
 * The page that replaces the editor when something unrecoverable happens (AGENTS: never lose the
 * work). It offers to try again, to export a copy when the app can, to download the local error log,
 * and to report the problem: that link opens an issue with the error and the environment filled
 * in, and never the project.
 */
export function FailureScreen(
  props: FailureProps & { onExport?: () => void; onDownloadLog?: () => void },
) {
  const { error, onRetry, onExport, onDownloadLog, where, appVersion = 'unknown' } = props;
  return (
    <div
      role="alert"
      className="mx-auto flex min-h-dvh max-w-lg flex-col items-start justify-center gap-4 p-6"
    >
      <AlertTriangleIcon className="size-8 text-warning" aria-hidden="true" />
      <h1 className="font-semibold text-xl">{t('error.title')}</h1>
      <p className="text-fg-muted">{t('error.description')}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRetry}>{t('error.retry')}</Button>
        {onExport && (
          <Button variant="outline" onClick={onExport}>
            {t('error.export')}
          </Button>
        )}
        <Button variant="outline" asChild>
          <a href={reportLink(error, where, appVersion)} target="_blank" rel="noopener noreferrer">
            {t('error.report')}
          </a>
        </Button>
        {onDownloadLog && (
          <Button variant="ghost" onClick={onDownloadLog}>
            {t('error.downloadLog')}
          </Button>
        )}
      </div>
      <details className="w-full text-fg-muted text-sm">
        <summary className="cursor-pointer">{t('error.details')}</summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-3 font-mono text-xs">
          {error.stack ?? `${error.name}: ${error.message}`}
        </pre>
      </details>
    </div>
  );
}

/** A compact version for one panel: the rest of the editor keeps working around it. */
export function PanelFallback(props: FailureProps & { panel: string }) {
  const { panel, error, onRetry, where, appVersion = 'unknown' } = props;
  return (
    <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm">
      <p className="font-medium text-fg">{t('error.panelTitle', { panel })}</p>
      <p className="text-fg-muted">{t('error.panelDescription')}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onRetry}>
          {t('error.retry')}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a
            href={reportLink(error, where ?? panel, appVersion)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('error.report')}
          </a>
        </Button>
      </div>
    </div>
  );
}
