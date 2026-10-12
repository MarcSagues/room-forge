import {
  type CatalogProvider,
  doorSweepObstacles,
  type EditorSession,
  type OpeningId,
} from '@roomforge/core';
import { notify } from '@/ui/components/toast';
import { translate } from '@/ui/i18n';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

/**
 * Opening a door whose leaf sweeps over furniture warns about it without undoing anything (P10-02,
 * ADR-0012: objects never block a door). However the door was opened (double click, panel,
 * outliner), the session's patches are the one place that sees it. Returns the cleanup.
 */
export function attachDoorFeedback(session: EditorSession, catalog: CatalogProvider): () => void {
  return session.on('document:changed', ({ patches, source }) => {
    if (source !== 'command') return;
    for (const { path, value } of patches) {
      if (path[0] !== 'openings' || path.length !== 3 || path[2] !== 'open') continue;
      if (typeof value !== 'number' || value <= 0) continue;
      const document = session.getState().document;
      const hits = doorSweepObstacles(document, catalog, path[1] as OpeningId).length;
      if (hits === 0) continue;
      const message = hits === 1 ? t('door.obstacleOne') : t('door.obstacleMany', { count: hits });
      notify((toast) => toast.warning(message, { id: 'door-obstacle' }));
    }
  });
}
