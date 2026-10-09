import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATABASE_NAME } from './database';
import { openProjectRepository } from './open-repository';
import { documentWith, id } from './testing/contract';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openProjectRepository', () => {
  it('stores projects in IndexedDB where the browser allows it', async () => {
    const { repository, mode, problem } = await openProjectRepository();
    expect(mode).toBe('indexeddb');
    expect(problem).toBeUndefined();
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
    // A second opening (the next visit) finds it.
    const again = await openProjectRepository();
    expect((await again.repository.list()).map((p) => p.name)).toEqual(['Office']);
  });

  it('without IndexedDB it falls back to memory, says why, and keeps working', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { repository, mode, problem } = await openProjectRepository();
    expect(mode).toBe('memory');
    expect(problem).toMatchObject({ code: 'UNAVAILABLE' });
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(2) });
    expect((await repository.get(id('p1')))?.document.objectOrder).toHaveLength(2);
    expect((await repository.list()).map((p) => p.name)).toEqual(['Office']);
  });

  it('a browser that refuses to open it also falls back to memory', async () => {
    vi.stubGlobal('indexedDB', {
      open() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    const opened = await openProjectRepository();
    expect(opened.mode).toBe('memory');
    expect(opened.problem?.code).toBe('UNAVAILABLE');
  });

  it('a database written by a newer app is left alone and projects stay in memory', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 9);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('projects', { keyPath: 'id' });
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const { repository, mode, problem } = await openProjectRepository();
    expect(mode).toBe('memory');
    expect(problem?.code).toBe('VERSION_ERROR');
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(0) });
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open(DATABASE_NAME);
      request.onsuccess = () => resolve(request.result);
    });
    expect(db.version).toBe(9);
    expect(db.objectStoreNames.contains('documents')).toBe(false);
    db.close();
  });

  it('asks the browser to keep the projects (navigator.storage.persist) after the first save', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } });
    const { repository } = await openProjectRepository();
    expect(persist).not.toHaveBeenCalled();
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(0) });
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  });

  it('works in a browser that has no storage manager', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: undefined });
    const { repository, mode } = await openProjectRepository();
    expect(mode).toBe('indexeddb');
    await expect(
      repository.save({ id: id('p1'), name: 'Office', document: documentWith(0) }),
    ).resolves.toBeDefined();
  });
});
