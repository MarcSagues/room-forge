'use client';

import { useState } from 'react';
import { Button } from '@/ui/components/button';
import { type MessageKey, translate } from '@/ui/i18n';

const t = (key: MessageKey) => translate('en', key);

/**
 * Says the project is being edited in another tab, so this one only shows it (P6-09), and offers
 * to take over. While taking over the button is busy: the other tab writes what it has first.
 */
export function ReadOnlyNotice(props: { onTakeOver: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const takeOver = () => {
    setBusy(true);
    props.onTakeOver().catch(() => setBusy(false));
  };
  return (
    <section
      role="status"
      aria-labelledby="read-only-title"
      className="absolute top-3 left-1/2 z-10 flex w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-md"
    >
      <p id="read-only-title" className="font-medium">
        {t('lock.title')}
      </p>
      <p className="text-fg-muted">{t('lock.body')}</p>
      <div>
        <Button size="sm" onClick={takeOver} disabled={busy} aria-busy={busy}>
          {t(busy ? 'lock.takingOver' : 'lock.takeOver')}
        </Button>
      </div>
    </section>
  );
}
