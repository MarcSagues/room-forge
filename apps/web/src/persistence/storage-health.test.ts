import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from './key-value-storage';
import {
  readStorageHealth,
  SMALL_QUOTA_BYTES,
  STORAGE_WARNING_KEY,
  storageAtRisk,
  takeStorageWarning,
} from './storage-health';

const GB = 1024 ** 3;

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('readStorageHealth', () => {
  it('reports usage, quota and persistence', async () => {
    const health = await readStorageHealth({
      persisted: async () => true,
      estimate: async () => ({ usage: 1234, quota: 2 * GB }),
    });
    expect(health).toEqual({ usage: 1234, quota: 2 * GB, persisted: true });
  });

  it('reports nothing it is not told, and never rejects', async () => {
    expect(await readStorageHealth(undefined)).toEqual({
      usage: null,
      quota: null,
      persisted: null,
    });
    expect(
      await readStorageHealth({
        persisted: () => Promise.reject(new Error('nope')),
        estimate: async () => ({ usage: Number.NaN, quota: -1 }),
      }),
    ).toEqual({ usage: null, quota: null, persisted: null });
  });
});

describe('storageAtRisk', () => {
  it.each([
    [{ usage: 0, quota: 2 * GB, persisted: true }, false],
    [{ usage: 0, quota: 2 * GB, persisted: null }, false],
    [{ usage: null, quota: null, persisted: null }, false],
    [{ usage: 0, quota: 2 * GB, persisted: false }, true],
    [{ usage: 0, quota: SMALL_QUOTA_BYTES - 1, persisted: true }, true],
  ])('%o → %s', (health, risky) => {
    expect(storageAtRisk(health)).toBe(risky);
  });
});

describe('takeStorageWarning', () => {
  const risky = { usage: 0, quota: 2 * GB, persisted: false };

  it('warns once, and remembers it', () => {
    const storage = memoryStorage();
    expect(takeStorageWarning(storage, risky)).toBe(true);
    expect(storage.getItem(STORAGE_WARNING_KEY)).toBe('1');
    expect(takeStorageWarning(storage, risky)).toBe(false);
  });

  it('does not warn about safe storage, nor without a place to remember', () => {
    const storage = memoryStorage();
    expect(takeStorageWarning(storage, { ...risky, persisted: true })).toBe(false);
    expect(storage.getItem(STORAGE_WARNING_KEY)).toBeNull();
    expect(takeStorageWarning(undefined, risky)).toBe(false);
  });
});
