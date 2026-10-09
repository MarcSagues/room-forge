import type { EditorSession } from '@roomforge/core';
import {
  type BackupReminder,
  type KeyValueStorage,
  type Scheduler,
  type StorageHealth,
  systemScheduler,
  takeStorageWarning,
} from '@/persistence';

export interface StorageCareOptions {
  session: Pick<EditorSession, 'on'>;
  reminder: BackupReminder;
  /** Where "warned once" is remembered. */
  storage: KeyValueStorage | undefined;
  readHealth: () => Promise<StorageHealth>;
  exportCopy: () => void;
  showBackupReminder: (actions: { onExport: () => void; onNever: () => void }) => void;
  showStorageWarning: (actions: { onExport: () => void }) => void;
  scheduler?: Scheduler;
  /**
   * How long after opening the storage is checked: the first save of a new project asks the
   * browser to keep the storage, and its answer should be in by then.
   */
  checkAfterMs?: number;
}

/**
 * The editor's care for the browser's storage (P6-09): warns once if the browser may clear it, and
 * now and then suggests exporting a copy. Only the tab that edits runs it. Returns how to stop.
 */
export function installStorageCare(options: StorageCareOptions): () => void {
  const {
    session,
    reminder,
    storage,
    readHealth,
    exportCopy,
    scheduler = systemScheduler,
  } = options;
  let stopped = false;

  const stopListening = session.on('document:changed', () => {
    if (reminder.recordEdit()) {
      options.showBackupReminder({ onExport: exportCopy, onNever: () => reminder.neverAgain() });
    }
  });

  const timer = scheduler.setTimeout(() => {
    void readHealth().then((health) => {
      if (!stopped && takeStorageWarning(storage, health)) {
        options.showStorageWarning({ onExport: exportCopy });
      }
    });
  }, options.checkAfterMs ?? 2_000);

  return () => {
    stopped = true;
    stopListening();
    scheduler.clearTimeout(timer);
  };
}
