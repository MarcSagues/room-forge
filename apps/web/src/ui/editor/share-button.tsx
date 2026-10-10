'use client';

import { Share2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/ui/components/button';
import { type MessageKey, translate } from '@/ui/i18n';
import { type ShareOutcome, useProjectStatus } from './project-status';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

/**
 * The Share button of the top bar (P6-08): copies a link that opens a read-only copy of the room,
 * and says what happened in a toast (announced politely). A link too long to make offers the file.
 */
export function ShareButton() {
  const { onShare, onExport } = useProjectStatus();
  const [busy, setBusy] = useState(false);
  if (!onShare) {
    return (
      <Button variant="outline" size="sm" disabled title={t('shell.soon')}>
        {t('shell.share')}
      </Button>
    );
  }
  const share = async () => {
    setBusy(true);
    let outcome: ShareOutcome;
    try {
      outcome = await onShare();
    } catch {
      outcome = { kind: 'copy-failed' };
    }
    setBusy(false);
    tell(outcome, onExport);
  };
  return (
    <Button variant="outline" size="sm" onClick={share} disabled={busy} aria-busy={busy}>
      <Share2Icon aria-hidden="true" />
      {busy ? t('share.making') : t('shell.share')}
    </Button>
  );
}

function tell(outcome: ShareOutcome, onExport: (() => void) | undefined) {
  const exportAction = onExport ? { label: t('share.export'), onClick: onExport } : undefined;
  switch (outcome.kind) {
    case 'copied':
      if (outcome.long) {
        const size = (outcome.length / 1024).toFixed(1);
        toast.warning(t('share.copiedLong', { size }), { id: 'share' });
      } else toast.success(t('share.copied'), { id: 'share' });
      return;
    case 'too-large':
      toast.error(t('share.tooLarge'), { id: 'share', duration: 20_000, action: exportAction });
      return;
    case 'unsupported':
      toast.error(t('share.unsupported'), { id: 'share', duration: 20_000, action: exportAction });
      return;
    case 'copy-failed':
      toast.error(t('share.copyFailed'), { id: 'share' });
  }
}
