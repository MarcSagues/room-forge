import {
  createStarterDocument,
  type ProjectRepository,
  RepositoryError,
  type SceneDocument,
} from '@roomforge/core';
import { createFakeClock, createFixtureCatalog, createSeqIdGen } from '@roomforge/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryProjectRepository,
  type KeyValueStorage,
  LAST_PROJECT_KEY,
  type OpenedRepository,
} from '@/persistence';
import { bootEditor } from './boot-editor';

function opened(
  repository: ProjectRepository,
  extra: Partial<OpenedRepository> = {},
): OpenedRepository {
  return { repository, mode: 'indexeddb', close: vi.fn(async () => {}), ...extra };
}

function storageOf(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setup(search = '', storage: KeyValueStorage = storageOf()) {
  const clock = createFakeClock(1_000);
  const repository = createMemoryProjectRepository({ clock, idGen: createSeqIdGen('copy') });
  const repositoryOpened = opened(repository);
  const boot = () =>
    bootEditor({
      openRepository: async () => repositoryOpened,
      search,
      storage,
      catalog: createFixtureCatalog(),
      untitledName: 'Untitled project',
      idGen: createSeqIdGen('new'),
    });
  return { repository, repositoryOpened, boot, storage };
}

const id = (value: string) => value as never;

describe('bootEditor', () => {
  it('opens the project in the address, with a session on its document', async () => {
    const { repository, boot } = setup('?project=p1');
    const document = createStarterDocument({ roomName: 'Study' });
    await repository.save({ id: id('p1'), name: 'Study', document });
    const result = await boot();
    expect(result.phase).toBe('ready');
    if (result.phase !== 'ready') return;
    expect(result.editor.project).toMatchObject({ id: 'p1', name: 'Study' });
    expect(result.editor.created).toBe(false);
    expect(Object.values(result.editor.session.getState().document.rooms)[0]?.name).toBe('Study');
    expect(result.editor.storage).toBe('indexeddb');
    expect(result.editor.repository).toBe(repository);
  });

  it('with no address, comes back to the last project', async () => {
    const storage = storageOf({ [LAST_PROJECT_KEY]: 'p2' });
    const { repository, boot } = setup('', storage);
    await repository.save({ id: id('p1'), name: 'One', document: createStarterDocument() });
    await repository.save({ id: id('p2'), name: 'Two', document: createStarterDocument() });
    const result = await boot();
    expect(result.phase === 'ready' && result.editor.project.name).toBe('Two');
  });

  it('with nothing stored, starts a project and saves it, so the first edit has somewhere to go', async () => {
    const { repository, boot } = setup();
    const result = await boot();
    expect(result.phase === 'ready' && result.editor.created).toBe(true);
    expect((await repository.list()).map((project) => project.name)).toEqual(['Untitled project']);
  });

  it('says so when the project in the address does not exist, and lets go of the database', async () => {
    const { boot, repositoryOpened } = setup('?project=ghost');
    const result = await boot();
    expect(result).toMatchObject({ phase: 'failed', failure: { kind: 'not-found' } });
    expect(repositoryOpened.close).toHaveBeenCalledTimes(1);
  });

  it('reports a stored document it cannot read, leaving it as it is', async () => {
    const { repository, boot } = setup('?project=bad');
    const broken = { ...createStarterDocument(), rooms: 'many' } as unknown as SceneDocument;
    await repository.save({ id: id('bad'), name: 'Broken', document: broken });
    const result = await boot();
    expect(result).toMatchObject({ phase: 'failed', failure: { kind: 'unreadable' } });
    expect((await repository.get(id('bad')))?.document).toEqual(broken);
  });

  it('reports the storage failing', async () => {
    const { repository, boot } = setup('?project=p1');
    vi.spyOn(repository, 'get').mockRejectedValue(new RepositoryError('UNAVAILABLE', 'no'));
    const result = await boot();
    expect(result).toMatchObject({
      phase: 'failed',
      failure: { kind: 'storage', error: { code: 'UNAVAILABLE' } },
    });
  });

  it('carries on in memory when the browser stores nothing, and says so', async () => {
    const clock = createFakeClock(0);
    const memory = createMemoryProjectRepository({ clock });
    const result = await bootEditor({
      openRepository: async () =>
        opened(memory, { mode: 'memory', problem: new RepositoryError('UNAVAILABLE', 'private') }),
      search: '',
      storage: storageOf(),
      catalog: createFixtureCatalog(),
      untitledName: 'Untitled project',
      idGen: createSeqIdGen('m'),
    });
    expect(result.phase === 'ready' && result.editor.storage).toBe('memory');
  });

  it('reads only the project parameter of the address, whatever else is in it', async () => {
    const { repository, boot } = setup('?utm=1&project=p7&debug=%3Cscript%3E');
    await repository.save({ id: id('p7'), name: 'Seven', document: createStarterDocument() });
    const result = await boot();
    expect(result.phase === 'ready' && result.editor.project.id).toBe('p7');
  });

  it('a hostile project parameter is "not found", not an error', async () => {
    const { boot } = setup('?project=../../etc/passwd');
    expect(await boot()).toMatchObject({ phase: 'failed', failure: { kind: 'not-found' } });
  });
});
