import { createFakeClock } from '@roomforge/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { createAutosave } from './autosave';
import { installAutosaveLifecycle } from './autosave-lifecycle';
import { createMemoryProjectRepository } from './memory-repository';
import { documentWith, id } from './testing/contract';
import { createFakeScheduler } from './testing/fake-scheduler';

function setup() {
  const clock = createFakeClock(1_000);
  const repository = createMemoryProjectRepository({ clock });
  const save = vi.spyOn(repository, 'save');
  let document = documentWith(0);
  const listeners = new Set<() => void>();
  const autosave = createAutosave({
    repository,
    projectId: id('p1'),
    name: () => 'Office',
    source: {
      document: () => document,
      onChange: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    clock,
    scheduler: createFakeScheduler(clock),
  });
  const edit = () => {
    document = documentWith(Object.keys(document.objects).length + 1);
    for (const listener of [...listeners]) listener();
  };
  const remove = installAutosaveLifecycle(autosave, window);
  return { autosave, save, edit, remove, repository };
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function settle() {
  for (let i = 0; i < 20; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('autosave lifecycle', () => {
  it('writes at once when the page is hidden: the change is not lost before the debounce', async () => {
    const { edit, save, remove } = setup();
    edit();
    setVisibility('hidden');
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    remove();
  });

  it('writes the journal first, synchronously, when the page goes away', () => {
    const { edit, remove, autosave } = setup();
    const journalNow = vi.spyOn(autosave, 'journalNow');
    edit();
    window.dispatchEvent(new Event('pagehide'));
    expect(journalNow).toHaveBeenCalledTimes(1);
    remove();
  });

  it('writes the journal when the page is hidden too', () => {
    const { edit, remove, autosave } = setup();
    const journalNow = vi.spyOn(autosave, 'journalNow');
    edit();
    setVisibility('hidden');
    expect(journalNow).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    expect(journalNow).toHaveBeenCalledTimes(1);
    remove();
  });

  it('writes at once on pagehide (closing the tab, reloading)', async () => {
    const { edit, save, remove, repository } = setup();
    edit();
    window.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect((await repository.get(id('p1')))?.document.objectOrder).toHaveLength(1);
    remove();
  });

  it('does nothing when the page becomes visible again', async () => {
    const { edit, save, remove } = setup();
    edit();
    setVisibility('visible');
    await settle();
    expect(save).not.toHaveBeenCalled();
    remove();
  });

  it('does not write when there is nothing to save', async () => {
    const { save, remove } = setup();
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('hidden');
    await settle();
    expect(save).not.toHaveBeenCalled();
    remove();
  });

  it('lets the page close without asking when everything is saved or only waiting', () => {
    const { edit, remove } = setup();
    const quiet = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
    edit();
    const waiting = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(waiting);
    expect(waiting.defaultPrevented).toBe(false);
    remove();
  });

  it('asks the browser to confirm closing when the last write failed: that is losing work', async () => {
    const { edit, save, remove, autosave } = setup();
    save.mockRejectedValue(new Error('full'));
    edit();
    await autosave.flush();
    expect(autosave.state().status).toBe('error');
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
    remove();
    await autosave.dispose();
  });

  it('removes its listeners', async () => {
    const { edit, save, remove } = setup();
    remove();
    edit();
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('hidden');
    await settle();
    expect(save).not.toHaveBeenCalled();
  });
});
