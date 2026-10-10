import { createFakeClock } from '@roomforge/core/testing';
import { describe, expect, it } from 'vitest';
import { BACKUP_REMINDER_KEY, createBackupReminder } from './backup-reminder';
import type { KeyValueStorage } from './key-value-storage';

const DAY = 24 * 60 * 60 * 1000;

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setup(storage: KeyValueStorage | undefined = memoryStorage()) {
  const clock = createFakeClock(1_000_000);
  const make = () => createBackupReminder({ storage, clock, everyEdits: 5, everyMs: 7 * DAY });
  return { clock, make, reminder: make() };
}

const edits = (reminder: { recordEdit(): boolean }, count: number) =>
  Array.from({ length: count }, () => reminder.recordEdit());

describe('createBackupReminder', () => {
  it('is due every N edits, and counts again from zero', () => {
    const { reminder } = setup();
    expect(edits(reminder, 5)).toEqual([false, false, false, false, true]);
    expect(edits(reminder, 5)).toEqual([false, false, false, false, true]);
  });

  it('counts across visits', () => {
    const { make } = setup();
    edits(make(), 3);
    expect(edits(make(), 2)).toEqual([false, true]);
  });

  it('is due after N days with an edit since the counting started', () => {
    const { reminder, clock } = setup();
    expect(reminder.recordEdit()).toBe(false);
    clock.advance(7 * DAY);
    expect(reminder.recordEdit()).toBe(true);
    clock.advance(DAY);
    expect(reminder.recordEdit()).toBe(false);
  });

  it('starts over when a copy is exported', () => {
    const { reminder, clock } = setup();
    edits(reminder, 4);
    clock.advance(6 * DAY);
    reminder.recordExport();
    clock.advance(6 * DAY);
    expect(edits(reminder, 4)).toEqual([false, false, false, false]);
  });

  it('is never due again after "Don\'t show again", even after an export', () => {
    const { reminder, clock } = setup();
    reminder.neverAgain();
    reminder.recordExport();
    clock.advance(30 * DAY);
    expect(edits(reminder, 20)).not.toContain(true);
  });

  it.each([
    'not json',
    JSON.stringify({ edits: -1, since: null, never: false }),
    JSON.stringify({ edits: 1, since: 'yesterday', never: false }),
    JSON.stringify({ edits: 1, since: null, never: 'yes' }),
    JSON.stringify({ edits: 1, since: null, never: false, pad: 'x'.repeat(300) }),
  ])('treats a damaged stored value as a fresh start: %s', (raw) => {
    const storage = memoryStorage();
    storage.data.set(BACKUP_REMINDER_KEY, raw);
    const { reminder } = setup(storage);
    expect(edits(reminder, 5)).toEqual([false, false, false, false, true]);
  });

  it('works, without remembering, where storage is blocked', () => {
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {},
    };
    const { reminder } = setup(blocked);
    expect(() => edits(reminder, 10)).not.toThrow();
    expect(setup(undefined).reminder.recordEdit()).toBe(false);
  });
});
