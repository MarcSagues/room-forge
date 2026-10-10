'use client';

import { SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog';
import { translate } from '@/ui/i18n';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

/** What the browser says about the site's storage; `null` where it does not say. */
export interface StorageInfo {
  usage: number | null;
  quota: number | null;
  /** Whether the browser promised not to clear the site's data. */
  persisted: boolean | null;
}

const UNITS = [
  ['gigabyte', 1024 ** 3],
  ['megabyte', 1024 ** 2],
  ['kilobyte', 1024],
] as const;

/** "1.5 GB", "320 kB", "12 byte": short, in the largest unit that fits. */
export function formatBytes(value: number): string {
  const [unit, size] = UNITS.find(([, size]) => value >= size) ?? ['byte', 1];
  return new Intl.NumberFormat('en', {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value / size);
}

function StorageSection({ info }: { info: StorageInfo | null }) {
  if (!info) return <p className="text-fg-muted">{t('settings.loading')}</p>;
  const { usage, quota, persisted } = info;
  return (
    <>
      {usage !== null && quota !== null ? (
        <>
          <p>{t('settings.usage', { used: formatBytes(usage), quota: formatBytes(quota) })}</p>
          <meter
            className="h-2 w-full"
            min={0}
            max={quota || 1}
            value={usage}
            aria-label={t('settings.storage')}
          />
        </>
      ) : (
        <p>{t('settings.usageUnknown')}</p>
      )}
      {persisted === null ? null : (
        <p className="text-fg-muted">
          {t(persisted ? 'settings.persisted' : 'settings.notPersisted')}
        </p>
      )}
    </>
  );
}

/**
 * The app's settings (P6-09): for now, how much of the browser's storage RoomForge uses and
 * whether the browser promised to keep it. Read each time the dialog opens.
 */
export function SettingsButton({ readStorage }: { readStorage: () => Promise<StorageInfo> }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<StorageInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setInfo(null);
    readStorage().then((value) => {
      if (!cancelled) setInfo(value);
    });
    return () => {
      cancelled = true;
    };
  }, [open, readStorage]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <SettingsIcon />
        {t('settings.open')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.title')}</DialogTitle>
            <DialogDescription className="sr-only">{t('settings.storage')}</DialogDescription>
          </DialogHeader>
          <section aria-labelledby="settings-storage" className="flex flex-col gap-2 text-sm">
            <h3 id="settings-storage" className="font-medium">
              {t('settings.storage')}
            </h3>
            <StorageSection info={info} />
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}
