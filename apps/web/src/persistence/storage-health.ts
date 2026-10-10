import type { KeyValueStorage } from './key-value-storage';

/** The part of `navigator.storage` this reads; injectable so tests do not depend on a browser. */
export interface StorageHealthManager {
  persisted?(): Promise<boolean>;
  estimate?(): Promise<{ usage?: number; quota?: number }>;
}

/** What the browser says about the site's storage; `null` where it does not say. */
export interface StorageHealth {
  /** Bytes in use. */
  usage: number | null;
  /** Bytes the site may use. */
  quota: number | null;
  /** Whether the browser promised not to evict the site's data. */
  persisted: boolean | null;
}

/**
 * Below this the storage is almost certainly temporary (private windows get a small, in-memory
 * quota); a normal profile gets gigabytes.
 */
export const SMALL_QUOTA_BYTES = 128 * 1024 * 1024;

/** Set once the warning about storage that may be cleared was shown: it is shown only once. */
export const STORAGE_WARNING_KEY = 'roomforge.storageWarningShown';

function browserManager(): StorageHealthManager | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage;
}

async function ask<T>(question: (() => Promise<T>) | undefined): Promise<T | undefined> {
  try {
    return await question?.();
  } catch {
    return undefined;
  }
}

const bytes = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Usage, quota and persistence, as far as the browser tells; never rejects. */
export async function readStorageHealth(
  manager: StorageHealthManager | undefined = browserManager(),
): Promise<StorageHealth> {
  const [persisted, estimate] = await Promise.all([
    ask(manager?.persisted?.bind(manager)),
    ask(manager?.estimate?.bind(manager)),
  ]);
  return {
    usage: bytes(estimate?.usage),
    quota: bytes(estimate?.quota),
    persisted: typeof persisted === 'boolean' ? persisted : null,
  };
}

/** The browser may clear the projects: it refused to keep them, or the storage is a private one. */
export function storageAtRisk(health: StorageHealth): boolean {
  return health.persisted === false || (health.quota !== null && health.quota < SMALL_QUOTA_BYTES);
}

/**
 * Whether to warn about storage at risk now: only the first time ever (per browser profile), and
 * noting that it was. Without `localStorage` it does not warn (it could not remember having done
 * it, and that browser is already told its projects only live in the tab).
 */
export function takeStorageWarning(
  storage: KeyValueStorage | undefined,
  health: StorageHealth,
): boolean {
  if (!storage || !storageAtRisk(health)) return false;
  try {
    if (storage.getItem(STORAGE_WARNING_KEY) !== null) return false;
    storage.setItem(STORAGE_WARNING_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
