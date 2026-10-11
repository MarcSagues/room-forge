import { notify } from '@/ui/components/toast';
import { translate } from '@/ui/i18n';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

/**
 * A new version is installed and waiting (P8-05). The toast stays until the person acts: the page
 * never reloads on its own, so nothing being edited is interrupted. sonner's toasts sit in a live
 * region and the action is a real button.
 */
export function showUpdateAvailable(actions: { onReload: () => void }): void {
  notify((toast) =>
    toast.info(t('update.title'), {
      id: 'update-available',
      description: t('update.body'),
      duration: Number.POSITIVE_INFINITY,
      action: { label: t('update.reload'), onClick: actions.onReload },
    }),
  );
}
