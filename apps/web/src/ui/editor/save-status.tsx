import { AlertTriangleIcon, CheckIcon, CircleDotIcon, Loader2Icon } from 'lucide-react';
import { translate } from '@/ui/i18n';
import { cn } from '@/ui/lib/utils';

/** Where the work stands, as the person is told it. The same four states autosave reports. */
export type SaveIndicator = 'saved' | 'saving' | 'dirty' | 'error';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

const LABELS = {
  saved: 'shell.saved',
  saving: 'shell.saving',
  dirty: 'shell.unsaved',
  error: 'shell.saveFailed',
} as const;

/** The save status of the top bar: a live region, with the words as well as the colour. */
export function SaveStatusPill({ status }: { status: SaveIndicator }) {
  return (
    <output
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-fg-muted text-xs',
        status === 'error' && 'bg-danger/15 font-medium text-danger',
      )}
    >
      {status === 'saved' ? <CheckIcon className="size-3 text-success" aria-hidden="true" /> : null}
      {status === 'saving' ? (
        <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
      ) : null}
      {status === 'dirty' ? <CircleDotIcon className="size-3" aria-hidden="true" /> : null}
      {status === 'error' ? <AlertTriangleIcon className="size-3" aria-hidden="true" /> : null}
      {t(LABELS[status])}
    </output>
  );
}
