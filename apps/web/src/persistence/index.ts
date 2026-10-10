/** Public API of the persistence module (ADR-0004): where projects are stored. */

export {
  type Autosave,
  type AutosaveOptions,
  type AutosaveSource,
  createAutosave,
  type SaveState,
  type SaveStatus,
  type Scheduler,
  systemScheduler,
} from './autosave';
export { installAutosaveLifecycle, type LifecycleTarget } from './autosave-lifecycle';
export { autosaveSourceOf } from './autosave-source';
export {
  BACKUP_REMINDER_KEY,
  type BackupReminder,
  type BackupReminderOptions,
  createBackupReminder,
} from './backup-reminder';
export {
  createIndexedDbProjectRepository,
  type IndexedDbProjectRepository,
  type IndexedDbRepositoryOptions,
  type StorageManagerLike,
} from './indexeddb-repository';
export { createLocalStorageJournal, type Journal, type JournalEntry } from './journal';
export { createMemoryProjectRepository, type MemoryRepositoryOptions } from './memory-repository';
export { type OpenedRepository, openProjectRepository } from './open-repository';
export {
  downloadFile,
  type ExportedFile,
  type ExportOptions,
  exportFileName,
  exportFileOf,
  exportProject,
  readProjectFile,
  slugify,
} from './project-files';
export {
  type KeyValueStorage,
  LAST_PROJECT_KEY,
  type OpenedProject,
  type OpenFailure,
  type OpenProjectOptions,
  type OpenResult,
  openProjectForEditing,
  rememberLastProject,
} from './project-loader';
export {
  browserLockApis,
  type ChannelLike,
  createProjectLock,
  type LockManagerLike,
  type LockRole,
  type ProjectLock,
  type ProjectLockOptions,
} from './project-lock';
export {
  readStorageHealth,
  SMALL_QUOTA_BYTES,
  STORAGE_WARNING_KEY,
  type StorageHealth,
  type StorageHealthManager,
  storageAtRisk,
  takeStorageWarning,
} from './storage-health';
