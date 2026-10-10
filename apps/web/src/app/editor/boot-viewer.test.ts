import { RepositoryError } from '@roomforge/core';
import { buildDocument } from '@roomforge/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryProjectRepository,
  createShareLink,
  type OpenedRepository,
} from '@/persistence';
import { bootViewer, copySharedProject } from './boot-viewer';

const NO_CATALOG = { getItem: () => undefined };
const options = { catalog: NO_CATALOG, untitledName: 'Untitled project' };

async function hashOf(name: string) {
  const link = await createShareLink(
    { name, document: buildDocument() },
    { origin: 'https://x.test' },
  );
  if (!link.ok) throw new Error('no link');
  return new URL(link.url).hash;
}

describe('bootViewer', () => {
  it('opens the room of a link in a read-only session', async () => {
    const boot = await bootViewer(await hashOf('Den'), options);
    if (boot.phase !== 'ready') throw new Error(`not ready: ${boot.phase}`);
    expect(boot.editor.project.name).toBe('Den');
    expect(boot.editor.session.getState().readOnly).toBe(true);
    expect(Object.keys(boot.editor.session.getState().document.objects)).toHaveLength(2);
    expect(boot.editor.storage).toBe('memory');
    expect(boot.editor.journal).toBeUndefined();
  });

  it('names a nameless room', async () => {
    const boot = await bootViewer(await hashOf('  '), options);
    expect(boot.phase === 'ready' && boot.editor.project.name).toBe('Untitled project');
  });

  it('says why a link cannot be opened', async () => {
    expect(await bootViewer('', options)).toEqual({ phase: 'failed', code: 'EMPTY' });
    expect(await bootViewer('#v1.@@@', options)).toEqual({ phase: 'failed', code: 'CORRUPT' });
    expect(await bootViewer('#v9.AAAA', options)).toEqual({
      phase: 'failed',
      code: 'NEWER_VERSION',
    });
  });
});

describe('copySharedProject', () => {
  const project = { name: 'Den', document: buildDocument() };

  it('saves the room as a new project under a new id, then lets go of the storage', async () => {
    const repository = createMemoryProjectRepository();
    const close = vi.fn(async () => {});
    const opened: OpenedRepository = { repository, mode: 'indexeddb', close };
    const id = await copySharedProject(
      project,
      async () => opened,
      () => 'copy-1',
    );
    expect(id).toBe('copy-1');
    expect(await repository.get(id)).toMatchObject({ name: 'Den', document: project.document });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('refuses where the browser keeps nothing: the copy would be lost', async () => {
    const close = vi.fn(async () => {});
    const opened: OpenedRepository = {
      repository: createMemoryProjectRepository(),
      mode: 'memory',
      close,
    };
    const copy = copySharedProject(project, async () => opened);
    await expect(copy).rejects.toBeInstanceOf(RepositoryError);
    await expect(copy).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
