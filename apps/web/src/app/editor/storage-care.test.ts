import { createEmitter, type SessionEvents } from '@roomforge/core';
import { describe, expect, it, vi } from 'vitest';
import type { BackupReminder, KeyValueStorage, Scheduler, StorageHealth } from '@/persistence';
import { installStorageCare, type StorageCareOptions } from './storage-care';

const RISKY: StorageHealth = { usage: 0, quota: 2 ** 31, persisted: false };
const SAFE: StorageHealth = { usage: 0, quota: 2 ** 31, persisted: true };

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setup(overrides: Partial<StorageCareOptions> = {}) {
  const emitter = createEmitter<SessionEvents>();
  let fire: (() => void) | undefined;
  const scheduler: Scheduler = {
    setTimeout: (callback) => {
      fire = callback;
      return 1;
    },
    clearTimeout: () => {
      fire = undefined;
    },
  };
  let due = false;
  const reminder: BackupReminder = {
    recordEdit: vi.fn(() => due),
    recordExport: vi.fn(),
    neverAgain: vi.fn(),
  };
  const options = {
    session: { on: emitter.on },
    reminder,
    storage: memoryStorage(),
    readHealth: async () => RISKY,
    exportCopy: vi.fn(),
    showBackupReminder: vi.fn(),
    showStorageWarning: vi.fn(),
    scheduler,
    ...overrides,
  };
  const stop = installStorageCare(options);
  const edit = () => emitter.emit('document:changed', { patches: [], source: 'command' });
  const check = async () => {
    fire?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { options, stop, edit, check, setDue: (value: boolean) => (due = value) };
}

describe('installStorageCare', () => {
  it('counts every edit and shows the reminder when it is due', () => {
    const { options, edit, setDue } = setup();
    edit();
    expect(options.reminder.recordEdit).toHaveBeenCalledTimes(1);
    expect(options.showBackupReminder).not.toHaveBeenCalled();
    setDue(true);
    edit();
    expect(options.showBackupReminder).toHaveBeenCalledTimes(1);

    const actions = vi.mocked(options.showBackupReminder).mock.calls[0]?.[0];
    actions?.onNever();
    expect(options.reminder.neverAgain).toHaveBeenCalled();
    actions?.onExport();
    expect(options.exportCopy).toHaveBeenCalled();
  });

  it('warns about storage at risk once, after a while', async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    expect(first.options.showStorageWarning).not.toHaveBeenCalled();
    await first.check();
    expect(first.options.showStorageWarning).toHaveBeenCalledTimes(1);

    const second = setup({ storage });
    await second.check();
    expect(second.options.showStorageWarning).not.toHaveBeenCalled();
  });

  it('does not warn about safe storage', async () => {
    const { options, check } = setup({ readHealth: async () => SAFE });
    await check();
    expect(options.showStorageWarning).not.toHaveBeenCalled();
  });

  it('stops listening and checking when stopped', async () => {
    const { options, stop, edit, check } = setup();
    stop();
    edit();
    await check();
    expect(options.reminder.recordEdit).not.toHaveBeenCalled();
    expect(options.showStorageWarning).not.toHaveBeenCalled();
  });
});
