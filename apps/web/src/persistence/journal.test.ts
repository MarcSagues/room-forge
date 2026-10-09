import { createFakeClock } from '@roomforge/core/testing';
import { describe, expect, it } from 'vitest';
import { createLocalStorageJournal, journalKey } from './journal';
import type { KeyValueStorage } from './project-loader';
import { documentWith } from './testing/contract';

function memoryStorage(limit = Number.POSITIVE_INFINITY) {
  const data = new Map<string, string>();
  const storage: KeyValueStorage & { data: Map<string, string> } = {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      let used = 0;
      for (const [k, v] of data) if (k !== key) used += k.length + v.length;
      if (used + key.length + value.length > limit)
        throw new DOMException('full', 'QuotaExceededError');
      data.set(key, value);
    },
    removeItem: (key) => void data.delete(key),
  };
  return storage;
}

describe('the recovery journal', () => {
  it('keeps the document of a project, with its name and when', () => {
    const clock = createFakeClock(7_000);
    const journal = createLocalStorageJournal(memoryStorage(), clock);
    const document = documentWith(3);
    expect(journal.write('p1', 'Office', document)).toBe(true);
    expect(journal.read('p1')).toEqual({ name: 'Office', document, at: 7_000 });
  });

  it('has one entry per project, and the newest replaces the older', () => {
    const clock = createFakeClock(1);
    const storage = memoryStorage();
    const journal = createLocalStorageJournal(storage, clock);
    journal.write('p1', 'A', documentWith(1));
    clock.advance(10);
    journal.write('p1', 'A', documentWith(2));
    journal.write('p2', 'B', documentWith(1));
    expect(journal.read('p1')?.document.objectOrder).toHaveLength(2);
    expect(journal.read('p1')?.at).toBe(11);
    expect(journal.read('p2')?.name).toBe('B');
    expect([...storage.data.keys()].sort()).toEqual([journalKey('p1'), journalKey('p2')]);
  });

  it('reads nothing for a project it has no entry for', () => {
    expect(createLocalStorageJournal(memoryStorage(), createFakeClock()).read('nope')).toBeNull();
  });

  it('clear removes the entry, and only that one', () => {
    const journal = createLocalStorageJournal(memoryStorage(), createFakeClock());
    journal.write('p1', 'A', documentWith(1));
    journal.write('p2', 'B', documentWith(1));
    journal.clear('p1');
    expect(journal.read('p1')).toBeNull();
    expect(journal.read('p2')).not.toBeNull();
  });

  it('says false, and keeps what it had, when the storage is full', () => {
    const journal = createLocalStorageJournal(memoryStorage(2_000), createFakeClock());
    expect(journal.write('p1', 'A', documentWith(1))).toBe(true);
    expect(journal.write('p1', 'A', documentWith(40))).toBe(false);
    expect(journal.read('p1')?.document.objectOrder).toHaveLength(1);
  });

  it('works as nothing at all without storage (blocked site data), and never throws', () => {
    const journal = createLocalStorageJournal(undefined, createFakeClock());
    expect(journal.write('p1', 'A', documentWith(1))).toBe(false);
    expect(journal.read('p1')).toBeNull();
    expect(() => journal.clear('p1')).not.toThrow();
  });

  it('treats a damaged entry as no entry, and removes it', () => {
    const storage = memoryStorage();
    const journal = createLocalStorageJournal(storage, createFakeClock());
    for (const text of [
      '{ not json',
      '"a string"',
      '[1]',
      '{"v":1}',
      '{"v":9,"name":"x","at":1,"document":{}}',
      'null',
    ]) {
      storage.data.set(journalKey('p1'), text);
      expect(journal.read('p1'), text).toBeNull();
      expect(storage.data.has(journalKey('p1')), text).toBe(false);
    }
  });

  it('never throws when the storage does', () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const journal = createLocalStorageJournal(throwing, createFakeClock());
    expect(journal.write('p1', 'A', documentWith(1))).toBe(false);
    expect(journal.read('p1')).toBeNull();
    expect(() => journal.clear('p1')).not.toThrow();
  });

  it('its keys are the project id under a prefix, so an id cannot reach another key', () => {
    expect(journalKey('abc')).toBe('roomforge.journal.abc');
    expect(journalKey('../x')).toBe('roomforge.journal.../x');
  });
});
