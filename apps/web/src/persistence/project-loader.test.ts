import {
  createStarterDocument,
  type ProjectRepository,
  RepositoryError,
  type SceneDocument,
} from '@roomforge/core';
import { createFakeClock, createFixtureCatalog, createSeqIdGen } from '@roomforge/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { createLocalStorageJournal, type Journal } from './journal';
import { createMemoryProjectRepository } from './memory-repository';
import {
  type KeyValueStorage,
  LAST_PROJECT_KEY,
  openProjectForEditing,
  rememberLastProject,
} from './project-loader';
import { documentWith, id } from './testing/contract';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setup(
  storage: KeyValueStorage = memoryStorage(),
  makeJournal?: (clock: ReturnType<typeof createFakeClock>) => Journal,
) {
  const clock = createFakeClock(5_000);
  const journal = makeJournal?.(clock);
  const repository = createMemoryProjectRepository({ clock, idGen: createSeqIdGen('copy') });
  const open = (projectId?: string | null) =>
    openProjectForEditing({
      repository,
      ...(journal ? { journal } : {}),
      ...(projectId !== undefined ? { projectId } : {}),
      storage,
      createDocument: () => createStarterDocument(),
      untitledName: 'Untitled project',
      idGen: createSeqIdGen('new'),
      catalog: createFixtureCatalog(),
    });
  return { repository, storage, open, clock };
}

describe('opening a project by id', () => {
  it('opens it with its document, and remembers it as the last one', async () => {
    const { repository, open, storage } = setup();
    const document = documentWith(2);
    await repository.save({ id: id('p1'), name: 'Office', document });
    const result = await open('p1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toBe(false);
    expect(result.value.project).toMatchObject({ id: 'p1', name: 'Office' });
    expect(result.value.project.document).toEqual(document);
    expect(storage.getItem(LAST_PROJECT_KEY)).toBe('p1');
  });

  it('says not-found for a project that does not exist, and creates nothing', async () => {
    const { repository, open } = setup();
    const result = await open('ghost');
    expect(result).toMatchObject({ ok: false, error: { kind: 'not-found', id: 'ghost' } });
    expect(await repository.list()).toEqual([]);
  });

  it('says not-found for an id that is not even an id (a hostile link)', async () => {
    const { open } = setup();
    for (const hostile of ['../../etc', '__proto__', 'a'.repeat(100), '<script>']) {
      expect(await open(hostile)).toMatchObject({ ok: false, error: { kind: 'not-found' } });
    }
  });

  it('does not fall back to another project when the one asked for is missing', async () => {
    const { repository, open, storage } = setup(memoryStorage({ [LAST_PROJECT_KEY]: 'p9' }));
    await repository.save({ id: id('p9'), name: 'Other', document: documentWith(0) });
    const result = await open('ghost');
    expect(result.ok).toBe(false);
    // ...and it did not forget the last project it knew either.
    expect(storage.getItem(LAST_PROJECT_KEY)).toBe('p9');
  });

  it('reports a stored document it cannot read, and leaves it untouched', async () => {
    const { repository, open } = setup();
    const broken = { ...documentWith(1), rooms: 'many' } as unknown as SceneDocument;
    await repository.save({ id: id('bad'), name: 'Broken', document: broken });
    const result = await open('bad');
    expect(result).toMatchObject({ ok: false, error: { kind: 'unreadable', id: 'bad' } });
    if (!result.ok && result.error.kind === 'unreadable') {
      expect(result.error.import.code).toBe('INVALID_DOCUMENT');
    }
    expect((await repository.get(id('bad')))?.document).toEqual(broken);
  });

  it('reports a failing store, with its code', async () => {
    const { repository, open } = setup();
    vi.spyOn(repository, 'get').mockRejectedValue(new RepositoryError('UNAVAILABLE', 'no storage'));
    expect(await open('p1')).toMatchObject({
      ok: false,
      error: { kind: 'storage', error: { code: 'UNAVAILABLE' } },
    });
  });
});

describe('opening without saying which (coming back to the editor)', () => {
  it('opens the last project that was open', async () => {
    const storage = memoryStorage({ [LAST_PROJECT_KEY]: 'p2' });
    const { repository, open } = setup(storage);
    await repository.save({ id: id('p1'), name: 'One', document: documentWith(0) });
    await repository.save({ id: id('p2'), name: 'Two', document: documentWith(1) });
    const result = await open();
    expect(result.ok && result.value.project.id).toBe('p2');
    expect(result.ok && result.value.created).toBe(false);
  });

  it('creates a first project when there is none, from the starter document, and saves it', async () => {
    const { repository, open, storage } = setup();
    const result = await open();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toBe(true);
    expect(result.value.project).toMatchObject({ id: 'new-1', name: 'Untitled project' });
    expect(result.value.project.document.roomOrder).toHaveLength(1);
    expect((await repository.get(id('new-1')))?.name).toBe('Untitled project');
    expect(storage.getItem(LAST_PROJECT_KEY)).toBe('new-1');
  });

  it('gives the new project a name no other has', async () => {
    const { repository, open } = setup();
    await repository.save({ id: id('p1'), name: 'Untitled project', document: documentWith(0) });
    const result = await open();
    expect(result.ok && result.value.project.name).toBe('Untitled project 2');
  });

  it('creates a new one when the last project is gone (deleted since), and says it did', async () => {
    const { open, storage } = setup(memoryStorage({ [LAST_PROJECT_KEY]: 'deleted' }));
    const result = await open();
    expect(result.ok && result.value.created).toBe(true);
    expect(storage.getItem(LAST_PROJECT_KEY)).toBe('new-1');
  });

  it('ignores a remembered id that is not an id', async () => {
    const { open } = setup(memoryStorage({ [LAST_PROJECT_KEY]: '../../x' }));
    expect((await open()).ok).toBe(true);
  });

  it('an empty ?project= counts as not saying which', async () => {
    const { open } = setup();
    const result = await open('');
    expect(result.ok && result.value.created).toBe(true);
  });

  it('works without any storage for the last project (blocked site data)', async () => {
    const clock = createFakeClock(0);
    const repository = createMemoryProjectRepository({ clock });
    const result = await openProjectForEditing({
      repository,
      createDocument: () => createStarterDocument(),
      untitledName: 'Untitled project',
      idGen: createSeqIdGen('n'),
    });
    expect(result.ok && result.value.created).toBe(true);
  });

  it('a storage that throws does not stop it from opening', async () => {
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
    const { open } = setup(throwing);
    expect((await open()).ok).toBe(true);
  });
});

describe('opening brings an old document up to date', () => {
  it('migrates it, says so, and writes the upgraded version back', async () => {
    const { repository, open } = setup();
    // The first prototype's shape (schemaVersion 0): rooms as an array with flat fields.
    const old = {
      schemaVersion: 0,
      rooms: [{ id: 'room-1', name: 'Old room', width: 4, depth: 3, height: 2.6 }],
      objects: [],
    } as unknown as SceneDocument;
    await repository.save({ id: id('old'), name: 'Old', document: old });
    const result = await open('old');
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.migrated).toBe(true);
    expect(result.value.project.document.schemaVersion).toBe(1);
    expect((await repository.get(id('old')))?.document.schemaVersion).toBe(1);
  });

  it('does not rewrite a project that is already current', async () => {
    const { repository, open } = setup();
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
    const save = vi.spyOn(repository, 'save');
    const result = await open('p1');
    expect(result.ok && result.value.migrated).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('opening recovers what the last visit could not save', () => {
  function journalSetup() {
    const storage = memoryStorage();
    let journal: Journal | undefined;
    const base = setup(storage, (clock) => {
      journal = createLocalStorageJournal(storage, clock);
      return journal;
    });
    return { ...base, storage, journal: journal as Journal };
  }

  it('opens the document of the journal when it is newer than the last save, saves it, and clears it', async () => {
    const { repository, open, journal, clock } = journalSetup();
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
    clock.advance(500);
    const unsaved = documentWith(4);
    journal.write('p1', 'Office', unsaved);
    const result = await open('p1');
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.recovered).toBe(true);
    expect(result.value.project.document).toEqual(unsaved);
    expect((await repository.get(id('p1')))?.document).toEqual(unsaved);
    expect(journal.read('p1')).toBeNull();
  });

  it('keeps the name the project has now, not the one the journal remembers', async () => {
    const { repository, open, journal, clock } = journalSetup();
    await repository.save({ id: id('p1'), name: 'Renamed since', document: documentWith(1) });
    clock.advance(500);
    journal.write('p1', 'Old name', documentWith(2));
    const result = await open('p1');
    expect(result.ok && result.value.project.name).toBe('Renamed since');
  });

  it('ignores a journal that is not newer than the last save, and clears it', async () => {
    const { repository, open, journal, clock } = journalSetup();
    journal.write('p1', 'Office', documentWith(9));
    clock.advance(500);
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
    const result = await open('p1');
    expect(result.ok && result.value.recovered).toBe(false);
    expect(result.ok && result.value.project.document.objectOrder).toHaveLength(1);
    expect(journal.read('p1')).toBeNull();
  });

  it('ignores a journal document that is damaged, keeps the saved one, and clears the journal', async () => {
    const { repository, open, journal, clock } = journalSetup();
    const saved = documentWith(1);
    await repository.save({ id: id('p1'), name: 'Office', document: saved });
    clock.advance(500);
    journal.write('p1', 'Office', { ...documentWith(2), rooms: 'many' } as never);
    const result = await open('p1');
    expect(result.ok && result.value.recovered).toBe(false);
    expect(result.ok && result.value.project.document).toEqual(saved);
    expect(journal.read('p1')).toBeNull();
  });

  it('does not create a project from a journal alone', async () => {
    const { repository, open, journal } = journalSetup();
    journal.write('ghost', 'Ghost', documentWith(2));
    expect((await open('ghost')).ok).toBe(false);
    expect(await repository.list()).toEqual([]);
  });

  it('a recovery that cannot be saved reports the storage, and keeps the journal', async () => {
    const { repository, open, journal, clock } = journalSetup();
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
    clock.advance(500);
    journal.write('p1', 'Office', documentWith(3));
    vi.spyOn(repository, 'save').mockRejectedValue(new RepositoryError('QUOTA_EXCEEDED', 'full'));
    const result = await open('p1');
    expect(result).toMatchObject({ ok: false, error: { kind: 'storage' } });
    expect(journal.read('p1')).not.toBeNull();
  });

  it('says it did not recover anything when there is no journal', async () => {
    const { repository, open } = journalSetup();
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
    const result = await open('p1');
    expect(result.ok && result.value.recovered).toBe(false);
  });
});

describe('rememberLastProject', () => {
  it('writes the id, and forgets it when asked to', () => {
    const storage = memoryStorage();
    rememberLastProject(storage, id('p1'));
    expect(storage.getItem(LAST_PROJECT_KEY)).toBe('p1');
    rememberLastProject(storage, null);
    expect(storage.getItem(LAST_PROJECT_KEY)).toBeNull();
  });

  it('never throws, whatever the storage does', () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } satisfies KeyValueStorage;
    expect(() => rememberLastProject(throwing, id('p1'))).not.toThrow();
    expect(() => rememberLastProject(throwing, null)).not.toThrow();
    expect(() => rememberLastProject(undefined, id('p1'))).not.toThrow();
  });
});

describe('the repository is only asked what it needs', () => {
  it('opening an existing project reads it once and lists nothing', async () => {
    const { repository, open } = setup();
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(0) });
    const wrapped: ProjectRepository = {
      ...repository,
      get: vi.fn(repository.get),
      list: vi.fn(repository.list),
    };
    await openProjectForEditing({
      repository: wrapped,
      projectId: 'p1',
      createDocument: () => createStarterDocument(),
      untitledName: 'x',
    });
    expect(wrapped.get).toHaveBeenCalledTimes(1);
    expect(wrapped.list).not.toHaveBeenCalled();
    expect(open).toBeDefined();
  });
});
