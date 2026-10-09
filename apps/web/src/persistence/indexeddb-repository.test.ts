import 'fake-indexeddb/auto';
import { createFakeClock, createSeqIdGen } from '@roomforge/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATABASE_NAME, UPGRADE_STEPS, type UpgradeStep } from './database';
import {
  createIndexedDbProjectRepository,
  type IndexedDbProjectRepository,
  PERSISTED_KEY,
} from './indexeddb-repository';
import { createMemoryProjectRepository } from './memory-repository';
import { describeProjectRepository, documentWith, id, unstorable } from './testing/contract';

/** Every test gets a database of its own: a new factory is an empty browser profile. */
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const opened: IndexedDbProjectRepository[] = [];
function repositoryWith(options: Parameters<typeof createIndexedDbProjectRepository>[0] = {}) {
  const repository = createIndexedDbProjectRepository(options);
  opened.push(repository);
  return repository;
}
afterEach(async () => {
  await Promise.all(opened.splice(0).map((repository) => repository.close()));
});

/** Opens the database the way another tab or an older build would, with no help from the repository. */
function openRaw(version?: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAll(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describeProjectRepository('IndexedDB repository', (clock, nextId) =>
  repositoryWith({ clock, idGen: nextId }),
);

describe('IndexedDB repository: atomic writes', () => {
  it('a document that cannot be stored leaves no project behind', async () => {
    const repository = repositoryWith();
    const bad = unstorable(documentWith(1));
    await expect(
      repository.save({ id: id('p1'), name: 'Office', document: bad }),
    ).rejects.toMatchObject({ code: 'FAILED' });
    expect(await repository.list()).toEqual([]);
    const db = await openRaw();
    expect(await readAll(db, 'projects')).toEqual([]);
    expect(await readAll(db, 'documents')).toEqual([]);
    db.close();
  });

  it('a failed save of an existing project leaves the previous version whole', async () => {
    const clock = createFakeClock(1_000);
    const repository = repositoryWith({ clock });
    const good = documentWith(2);
    await repository.save({ id: id('p1'), name: 'Office', document: good });
    clock.advance(100);
    const bad = unstorable(documentWith(5));
    await expect(
      repository.save({ id: id('p1'), name: 'Renamed', document: bad }),
    ).rejects.toBeDefined();
    expect(await repository.get(id('p1'))).toEqual({
      id: 'p1',
      name: 'Office',
      createdAt: 1_000,
      updatedAt: 1_000,
      document: good,
    });
  });

  it('a failure in the second write undoes the first one (quota)', async () => {
    const repository = repositoryWith();
    await repository.save({ id: id('keep'), name: 'Keep', document: documentWith(1) });
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (this.name === 'documents') throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(
      repository.save({ id: id('p2'), name: 'New', document: documentWith(1) }),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    vi.restoreAllMocks();
    expect((await repository.list()).map((p) => p.id)).toEqual(['keep']);
    const db = await openRaw();
    expect(await readAll(db, 'documents')).toHaveLength(1);
    db.close();
  });

  it('the repository keeps working after a failed save', async () => {
    const repository = repositoryWith();
    await expect(
      repository.save({ id: id('p1'), name: 'A', document: unstorable(documentWith(0)) }),
    ).rejects.toBeDefined();
    await repository.save({ id: id('p1'), name: 'A', document: documentWith(1) });
    expect((await repository.get(id('p1')))?.document.objectOrder).toHaveLength(1);
  });

  it('a failed duplicate leaves nothing behind', async () => {
    const repository = repositoryWith({ idGen: () => 'bad id with spaces' });
    await repository.save({ id: id('p1'), name: 'A', document: documentWith(1) });
    await expect(repository.duplicate(id('p1'))).rejects.toBeDefined();
    expect((await repository.list()).map((p) => p.id)).toEqual(['p1']);
  });

  it('delete removes the project and its document in one step', async () => {
    const repository = repositoryWith();
    await repository.save({ id: id('p1'), name: 'A', document: documentWith(1) });
    await repository.delete(id('p1'));
    const db = await openRaw();
    expect(await readAll(db, 'projects')).toEqual([]);
    expect(await readAll(db, 'documents')).toEqual([]);
    db.close();
  });

  it('a project whose document is missing reads as not found (it cannot be opened)', async () => {
    const repository = repositoryWith();
    await repository.save({ id: id('p1'), name: 'A', document: documentWith(1) });
    const db = await openRaw();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').delete('p1');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    expect(await repository.get(id('p1'))).toBeUndefined();
  });
});

describe('IndexedDB repository: database versions', () => {
  const addIndex: UpgradeStep = (_db, transaction) => {
    transaction.objectStore('projects').createIndex('by-name', 'name');
  };

  it('creates the three stores on first use', async () => {
    const repository = repositoryWith();
    await repository.list();
    const db = await openRaw();
    expect([...db.objectStoreNames].sort()).toEqual(['documents', 'meta', 'projects']);
    expect(db.version).toBe(UPGRADE_STEPS.length);
    db.close();
  });

  it('upgrading the database from version 1 to 2 keeps every project', async () => {
    const v1 = repositoryWith({ steps: UPGRADE_STEPS });
    const docs = [documentWith(1), documentWith(3)];
    await v1.save({ id: id('a'), name: 'A', document: docs[0] as never });
    await v1.save({ id: id('b'), name: 'B', document: docs[1] as never });
    await v1.close();

    const v2 = repositoryWith({ steps: [...UPGRADE_STEPS, addIndex] });
    expect((await v2.list()).map((p) => p.name).sort()).toEqual(['A', 'B']);
    expect((await v2.get(id('b')))?.document).toEqual(docs[1]);

    const db = await openRaw();
    expect(db.version).toBe(2);
    expect([...db.transaction('projects').objectStore('projects').indexNames]).toEqual(['by-name']);
    db.close();
  });

  it('a new database goes straight to the newest version, running every step', async () => {
    const ran: number[] = [];
    const steps: UpgradeStep[] = [...UPGRADE_STEPS, () => ran.push(2), () => ran.push(3)];
    const repository = repositoryWith({ steps });
    await repository.list();
    expect(ran).toEqual([2, 3]);
    const db = await openRaw();
    expect(db.version).toBe(3);
    db.close();
  });

  it('a step that fails undoes the upgrade and the data is still there', async () => {
    const v1 = repositoryWith();
    await v1.save({ id: id('a'), name: 'A', document: documentWith(2) });
    await v1.close();

    const broken = repositoryWith({
      steps: [
        ...UPGRADE_STEPS,
        () => {
          throw new Error('bad step');
        },
      ],
    });
    await expect(broken.list()).rejects.toBeDefined();
    await broken.close();

    const db = await openRaw();
    expect(db.version).toBe(1);
    db.close();
    const again = repositoryWith();
    expect((await again.get(id('a')))?.name).toBe('A');
  });

  it('a database written by a newer app is reported as VERSION_ERROR, untouched', async () => {
    const future = await openRaw(5, (db) => {
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('documents', { keyPath: 'id' });
      db.createObjectStore('meta');
    });
    future.close();
    const repository = repositoryWith();
    await expect(repository.list()).rejects.toMatchObject({ code: 'VERSION_ERROR' });
    await expect(
      repository.save({ id: id('p'), name: 'x', document: documentWith(0) }),
    ).rejects.toMatchObject({ code: 'VERSION_ERROR' });
    const db = await openRaw();
    expect(db.version).toBe(5);
    db.close();
  });

  it('a tab that is not closing its connection makes the upgrade BLOCKED, and it can be retried', async () => {
    const holder = await openRaw(1, (db) => {
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('documents', { keyPath: 'id' });
      db.createObjectStore('meta');
    });
    // `holder` has no versionchange handler: it keeps the old version open, like a stuck old tab.
    const repository = repositoryWith({ steps: [...UPGRADE_STEPS, addIndex] });
    await expect(repository.list()).rejects.toMatchObject({ code: 'BLOCKED' });
    holder.close();
    await vi.waitFor(async () => expect(await repository.list()).toEqual([]));
  });

  it('an open tab lets a newer one upgrade, and finds the database newer when it comes back', async () => {
    const oldTab = repositoryWith();
    await oldTab.save({ id: id('a'), name: 'A', document: documentWith(1) });

    const newTab = repositoryWith({ steps: [...UPGRADE_STEPS, addIndex] });
    expect((await newTab.list()).map((p) => p.id)).toEqual(['a']);

    // The old tab gave its connection up; reopening finds a database newer than its own code.
    await expect(oldTab.list()).rejects.toMatchObject({ code: 'VERSION_ERROR' });
    // The new tab is unharmed.
    await newTab.save({ id: id('b'), name: 'B', document: documentWith(0) });
    expect(await newTab.list()).toHaveLength(2);
  });
});

describe('IndexedDB repository: no storage', () => {
  it('without IndexedDB every operation fails with UNAVAILABLE', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const repository = repositoryWith();
    await expect(repository.list()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(repository.get(id('p'))).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      repository.save({ id: id('p'), name: 'x', document: documentWith(0) }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('a browser that refuses to open the database says UNAVAILABLE', async () => {
    vi.stubGlobal('indexedDB', {
      open() {
        throw new DOMException('Access is denied for this document', 'SecurityError');
      },
    });
    await expect(repositoryWith().list()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('a failed attempt is not remembered: when storage comes back, it works', async () => {
    const working = indexedDB;
    vi.stubGlobal('indexedDB', undefined);
    const repository = repositoryWith();
    await expect(repository.list()).rejects.toBeDefined();
    vi.stubGlobal('indexedDB', working);
    await expect(repository.list()).resolves.toEqual([]);
  });
});

describe('IndexedDB repository: connection', () => {
  it('opens again by itself after being closed', async () => {
    const repository = repositoryWith();
    await repository.save({ id: id('p1'), name: 'A', document: documentWith(1) });
    await repository.close();
    expect((await repository.list()).map((p) => p.id)).toEqual(['p1']);
  });

  it('two repositories over one database see each other’s writes', async () => {
    const a = repositoryWith();
    const b = repositoryWith();
    await a.save({ id: id('p1'), name: 'A', document: documentWith(1) });
    expect((await b.list()).map((p) => p.id)).toEqual(['p1']);
    await b.delete(id('p1'));
    expect(await a.get(id('p1'))).toBeUndefined();
  });

  it('opens the database once for many operations at the same time', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    const repository = repositoryWith();
    await Promise.all([repository.list(), repository.list(), repository.get(id('x'))]);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('IndexedDB repository: persistent storage', () => {
  it('does not ask until something has been saved', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const repository = repositoryWith({ storageManager: { persist } });
    await repository.list();
    await repository.get(id('x'));
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks once, after the first save, and notes the answer', async () => {
    const clock = createFakeClock(5_000);
    const persist = vi.fn().mockResolvedValue(true);
    const repository = repositoryWith({ clock, storageManager: { persist } });
    await repository.save({ id: id('p1'), name: 'A', document: documentWith(0) });
    await repository.save({ id: id('p1'), name: 'A', document: documentWith(1) });
    await vi.waitFor(async () =>
      expect(await repository.getMeta(PERSISTED_KEY)).toEqual({ granted: true, at: 5_000 }),
    );
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('notes a refusal too', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    const repository = repositoryWith({ storageManager: { persist } });
    await repository.save({ id: id('p1'), name: 'A', document: documentWith(0) });
    await vi.waitFor(async () =>
      expect(await repository.getMeta(PERSISTED_KEY)).toMatchObject({ granted: false }),
    );
  });

  it('a failing request does not fail the save', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('no'));
    const repository = repositoryWith({ storageManager: { persist } });
    await expect(
      repository.save({ id: id('p1'), name: 'A', document: documentWith(0) }),
    ).resolves.toMatchObject({ id: 'p1' });
    await vi.waitFor(() => expect(persist).toHaveBeenCalled());
    expect(await repository.getMeta(PERSISTED_KEY)).toBeUndefined();
  });

  it('a failed save does not count as the first one', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const repository = repositoryWith({ storageManager: { persist } });
    await expect(
      repository.save({ id: id('p1'), name: ' ', document: documentWith(0) }),
    ).rejects.toBeDefined();
    expect(persist).not.toHaveBeenCalled();
  });

  it('stores flags in the meta store', async () => {
    const repository = repositoryWith();
    expect(await repository.getMeta('flag')).toBeUndefined();
    await repository.setMeta('flag', { a: [1, 2] });
    expect(await repository.getMeta('flag')).toEqual({ a: [1, 2] });
  });
});

describe('IndexedDB repository behaves like the in-memory one', () => {
  type Operation =
    | { kind: 'save'; project: number; objects: number; name: string }
    | { kind: 'rename'; project: number; name: string }
    | { kind: 'duplicate'; project: number; name: string | undefined }
    | { kind: 'delete'; project: number }
    | { kind: 'tick'; ms: number };

  const operations = fc.array(
    fc.oneof(
      fc.record({
        kind: fc.constant('save' as const),
        project: fc.integer({ min: 0, max: 3 }),
        objects: fc.integer({ min: 0, max: 3 }),
        name: fc.oneof(fc.constantFrom('Office', ' Gaming ', ''), fc.string({ maxLength: 12 })),
      }),
      fc.record({
        kind: fc.constant('rename' as const),
        project: fc.integer({ min: 0, max: 3 }),
        name: fc.oneof(fc.constantFrom('New', '   '), fc.string({ maxLength: 12 })),
      }),
      fc.record({
        kind: fc.constant('duplicate' as const),
        project: fc.integer({ min: 0, max: 3 }),
        name: fc.option(fc.constantFrom('Copy', ' '), { nil: undefined }),
      }),
      fc.record({ kind: fc.constant('delete' as const), project: fc.integer({ min: 0, max: 3 }) }),
      fc.record({ kind: fc.constant('tick' as const), ms: fc.integer({ min: 0, max: 50 }) }),
    ),
    { maxLength: 14 },
  );

  async function run(
    make: (
      clock: ReturnType<typeof createFakeClock>,
    ) => IndexedDbProjectRepository | ReturnType<typeof createMemoryProjectRepository>,
    steps: Operation[],
  ) {
    const clock = createFakeClock(1_000);
    const repository = make(clock);
    const outcomes: unknown[] = [];
    for (const step of steps) {
      const target = id(`p${'project' in step ? step.project : 0}`);
      try {
        switch (step.kind) {
          case 'save':
            outcomes.push(
              await repository.save({
                id: target,
                name: step.name,
                document: documentWith(step.objects),
              }),
            );
            break;
          case 'rename':
            outcomes.push(await repository.rename(target, step.name));
            break;
          case 'duplicate':
            outcomes.push(await repository.duplicate(target, step.name));
            break;
          case 'delete':
            outcomes.push(await repository.delete(target));
            break;
          case 'tick':
            clock.advance(step.ms);
            break;
        }
      } catch (error) {
        outcomes.push({ error: (error as { code?: string }).code });
      }
    }
    const list = await repository.list();
    const documents = await Promise.all(list.map((project) => repository.get(project.id)));
    return { outcomes, list, documents };
  }

  it('gives the same answers to any sequence of operations', async () => {
    await fc.assert(
      fc.asyncProperty(operations, async (steps) => {
        vi.stubGlobal('indexedDB', new IDBFactory());
        const real = await run(
          (clock) => repositoryWith({ clock, idGen: createSeqIdGen('copy') }),
          steps,
        );
        const model = await run(
          (clock) => createMemoryProjectRepository({ clock, idGen: createSeqIdGen('copy') }),
          steps,
        );
        expect(real).toEqual(model);
        await Promise.all(opened.splice(0).map((repository) => repository.close()));
      }),
      { numRuns: 40 },
    );
  });
});
