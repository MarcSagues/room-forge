import { notify } from '@/ui/components/toast';
import { translate } from '@/ui/i18n';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

/**
 * The periodic suggestion to export a copy (P6-09): a toast that goes away on its own, so it never
 * blocks the work, with the export and a way to stop it for good.
 */
export function showBackupReminder(actions: { onExport: () => void; onNever: () => void }): void {
  notify((toast) =>
    toast(t('backup.title'), {
      id: 'backup-reminder',
      description: t('backup.body'),
      duration: 20_000,
      action: { label: t('save.export'), onClick: actions.onExport },
      cancel: { label: t('backup.never'), onClick: actions.onNever },
    }),
  );
}

/** Shown once ever: the browser may clear what it stores (private window, refused persistence). */
export function showStorageWarning(actions: { onExport: () => void }): void {
  notify((toast) =>
    toast.warning(t('storageRisk.title'), {
      id: 'storage-risk',
      description: t('storageRisk.body'),
      duration: Number.POSITIVE_INFINITY,
      action: { label: t('save.export'), onClick: actions.onExport },
      cancel: { label: t('storageRisk.dismiss'), onClick: () => {} },
    }),
  );
}
