import {
  type ProjectRepository,
  type ProjectSummary,
  RepositoryError,
  type SceneDocument,
} from '@roomforge/core';
import { createFakeClock } from '@roomforge/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AutosaveSource, createAutosave, type SaveState } from './autosave';
import type { Journal } from './journal';
import { createMemoryProjectRepository } from './memory-repository';
import { documentWith, id } from './testing/contract';
import { createFakeScheduler } from './testing/fake-scheduler';

/** A document source the test drives by hand: `edit()` makes a new document, like a command does. */
function createSource(initial: SceneDocument = documentWith(0)) {
  let current = initial;
  const listeners = new Set<() => void>();
  const source: AutosaveSource = {
    document: () => current,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    edit(objects = Object.keys(current.objects).length + 1) {
      current = documentWith(objects);
      for (const listener of [...listeners]) listener();
      return current;
    },
    listeners: () => listeners.size,
  };
}

function setup(
  options: { name?: () => string; debounceMs?: number; maxWaitMs?: number; journal?: Journal } = {},
) {
  const clock = createFakeClock(1_000_000);
  const scheduler = createFakeScheduler(clock);
  const inner = createMemoryProjectRepository({ clock });
  const save = vi.fn<ProjectRepository['save']>((input) => inner.save(input));
  const repository: ProjectRepository = { ...inner, save };
  const doc = createSource();
  const autosave = createAutosave({
    repository,
    projectId: id('p1'),
    name: options.name ?? (() => 'Office'),
    source: doc.source,
    clock,
    scheduler,
    ...(options.debounceMs !== undefined ? { debounceMs: options.debounceMs } : {}),
    ...(options.maxWaitMs !== undefined ? { maxWaitMs: options.maxWaitMs } : {}),
    ...(options.journal ? { journal: options.journal } : {}),
  });
  const states: SaveState[] = [];
  autosave.subscribe((state) => states.push(state));
  return { clock, scheduler, repository, inner, save, doc, autosave, states };
}

/** A save the test finishes (or fails) when it chooses. */
function slowSave(context: ReturnType<typeof setup>) {
  const waiting: Array<{ finish(): void; fail(error: unknown): void }> = [];
  context.save.mockImplementation(
    (input) =>
      new Promise<ProjectSummary>((resolve, reject) => {
        waiting.push({
          finish: () => void context.inner.save(input).then(resolve, reject),
          fail: reject,
        });
      }),
  );
  return waiting;
}

describe('autosave: when it writes', () => {
  it('starts saved and writes nothing by itself', async () => {
    const { autosave, scheduler, save } = setup();
    expect(autosave.state()).toMatchObject({ status: 'saved', lastSavedAt: null, error: null });
    await scheduler.advance(60_000);
    expect(save).not.toHaveBeenCalled();
  });

  it('a change makes it dirty, and nothing is written until the debounce has passed', async () => {
    const { autosave, doc, scheduler, save } = setup();
    doc.edit();
    expect(autosave.state().status).toBe('dirty');
    await scheduler.advance(1_499);
    expect(save).not.toHaveBeenCalled();
    expect(autosave.state().status).toBe('dirty');
  });

  it('then writes the latest document under the current name, once, and is saved', async () => {
    const { autosave, doc, scheduler, save, inner, clock } = setup({ name: () => 'Gaming room' });
    const edited = doc.edit(3);
    await scheduler.advance(1_500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toMatchObject({ id: 'p1', name: 'Gaming room' });
    expect((await inner.get(id('p1')))?.document).toEqual(edited);
    expect(autosave.state()).toMatchObject({
      status: 'saved',
      lastSavedAt: clock.now(),
      error: null,
      failures: 0,
    });
  });

  it('passes through saving on the way', async () => {
    const { doc, scheduler, states } = setup();
    doc.edit();
    await scheduler.advance(1_500);
    expect(states.map((state) => state.status)).toEqual(['dirty', 'saving', 'saved']);
  });

  it('50 quick changes make at most 2 writes (here 1)', async () => {
    const { doc, scheduler, save } = setup();
    for (let i = 1; i <= 50; i += 1) {
      doc.edit(i);
      await scheduler.advance(20);
    }
    await scheduler.advance(2_000);
    expect(save.mock.calls.length).toBeLessThanOrEqual(2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].document.objectOrder).toHaveLength(50);
  });

  it('keeps editing from starving the save: at most 10 seconds pass without one', async () => {
    const { doc, scheduler, save, clock } = setup();
    const writes: number[] = [];
    save.mockImplementation(async (input) => {
      writes.push(clock.now());
      return { id: input.id, name: input.name, createdAt: 0, updatedAt: 0 };
    });
    const start = clock.now();
    // A change every second for 35 seconds: the debounce alone would never fire.
    for (let i = 1; i <= 35; i += 1) {
      doc.edit(i);
      await scheduler.advance(1_000);
    }
    await scheduler.advance(2_000);
    expect(writes.length).toBeGreaterThanOrEqual(3);
    expect(writes.length).toBeLessThanOrEqual(5);
    expect((writes[0] ?? 0) - start).toBeLessThanOrEqual(10_000);
    for (let i = 1; i < writes.length; i += 1) {
      expect((writes[i] ?? 0) - (writes[i - 1] ?? 0)).toBeLessThanOrEqual(10_500);
    }
  });

  it('honours other debounce and maximum waits', async () => {
    const { doc, scheduler, save } = setup({ debounceMs: 200, maxWaitMs: 1_000 });
    doc.edit();
    await scheduler.advance(199);
    expect(save).not.toHaveBeenCalled();
    await scheduler.advance(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reads the name when it writes, not when the change was made', async () => {
    let name = 'Before';
    const { doc, scheduler, save } = setup({ name: () => name });
    doc.edit();
    name = 'After';
    await scheduler.advance(1_500);
    expect(save.mock.calls[0]?.[0].name).toBe('After');
  });
});

describe('autosave: a change while saving is not lost', () => {
  it('writes again with the newer document, never two saves at once', async () => {
    const context = setup();
    const waiting = slowSave(context);
    context.doc.edit(1);
    await context.scheduler.advance(1_500);
    expect(context.autosave.state().status).toBe('saving');
    expect(waiting).toHaveLength(1);

    // The person keeps working while the first write is still going.
    const newer = context.doc.edit(2);
    await context.scheduler.advance(5_000);
    expect(waiting).toHaveLength(1);
    expect(context.save).toHaveBeenCalledTimes(1);

    // The change had already waited longer than the debounce, so the next write starts at once.
    waiting[0]?.finish();
    await context.scheduler.advance(0);
    expect(waiting).toHaveLength(2);
    expect(context.autosave.state().status).toBe('saving');
    waiting[1]?.finish();
    await context.scheduler.advance(0);
    expect(context.autosave.state().status).toBe('saved');
    expect((await context.inner.get(id('p1')))?.document).toEqual(newer);
  });

  it('is saved, not dirty, when nothing changed during the save', async () => {
    const context = setup();
    const waiting = slowSave(context);
    context.doc.edit(1);
    await context.scheduler.advance(1_500);
    waiting[0]?.finish();
    await context.scheduler.advance(0);
    expect(context.autosave.state().status).toBe('saved');
    expect(context.scheduler.pending()).toBe(0);
  });
});

describe('autosave: flush (the page is hiding or closing)', () => {
  it('saves at once what is pending, without waiting for the debounce', async () => {
    const { autosave, doc, save, scheduler } = setup();
    const edited = doc.edit(4);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].document).toBe(edited);
    expect(autosave.state().status).toBe('saved');
    // The timer that was waiting is gone: no second write later.
    await scheduler.advance(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when everything is saved', async () => {
    const { autosave, save } = setup();
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('waits for a save in progress and then saves what changed during it', async () => {
    const context = setup();
    const waiting = slowSave(context);
    context.doc.edit(1);
    await context.scheduler.advance(1_500);
    const newer = context.doc.edit(2);
    const flushed = context.autosave.flush();
    waiting[0]?.finish();
    await context.scheduler.advance(0);
    waiting[1]?.finish();
    await flushed;
    expect(context.autosave.state().status).toBe('saved');
    expect((await context.inner.get(id('p1')))?.document).toEqual(newer);
  });
});

describe('autosave: when saving fails', () => {
  const quota = () => new RepositoryError('QUOTA_EXCEEDED', 'full');

  it('says so, with the error, and keeps what it could not save', async () => {
    const { autosave, doc, scheduler, save } = setup();
    save.mockRejectedValue(quota());
    doc.edit();
    await scheduler.advance(1_500);
    const state = autosave.state();
    expect(state.status).toBe('error');
    expect(state.error).toBeInstanceOf(RepositoryError);
    expect(state.error?.code).toBe('QUOTA_EXCEEDED');
    expect(state.failures).toBe(1);
  });

  it('turns anything that is not a RepositoryError into a generic failure', async () => {
    const { autosave, doc, scheduler, save } = setup();
    save.mockRejectedValue(new TypeError('boom'));
    doc.edit();
    await scheduler.advance(1_500);
    expect(autosave.state().error?.code).toBe('FAILED');
  });

  it('retries with backoff: 2 s, 4 s, 8 s, and never more than 30 s apart', async () => {
    const { doc, scheduler, save, clock } = setup();
    const attempts: number[] = [];
    save.mockImplementation(async () => {
      attempts.push(clock.now());
      throw quota();
    });
    doc.edit();
    await scheduler.advance(1_500);
    await scheduler.advance(120_000);
    const gaps = attempts.slice(1).map((at, i) => at - (attempts[i] ?? 0));
    expect(gaps.slice(0, 5)).toEqual([2_000, 4_000, 8_000, 16_000, 30_000]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(30_000);
  });

  it('recovers: the next try that works saves the latest document and clears the error', async () => {
    const { autosave, doc, scheduler, save, inner } = setup();
    save.mockRejectedValueOnce(quota()).mockRejectedValueOnce(quota());
    doc.edit(1);
    await scheduler.advance(1_500);
    const latest = doc.edit(5); // more work while it is failing
    expect(autosave.state().status).toBe('error');
    await scheduler.advance(2_000);
    await scheduler.advance(4_000);
    expect(autosave.state()).toMatchObject({ status: 'saved', error: null, failures: 0 });
    expect((await inner.get(id('p1')))?.document).toEqual(latest);
  });

  it('a change while it is failing does not hide the failure', async () => {
    const { autosave, doc, scheduler, save } = setup();
    save.mockRejectedValue(quota());
    doc.edit(1);
    await scheduler.advance(1_500);
    doc.edit(2);
    expect(autosave.state().status).toBe('error');
  });

  it('retry() tries again at once', async () => {
    const { autosave, doc, scheduler, save } = setup();
    save.mockRejectedValueOnce(quota());
    doc.edit();
    await scheduler.advance(1_500);
    expect(autosave.state().status).toBe('error');
    await autosave.retry();
    expect(autosave.state().status).toBe('saved');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('flush also tries again when the last attempt failed', async () => {
    const { autosave, doc, scheduler, save } = setup();
    save.mockRejectedValueOnce(quota());
    doc.edit();
    await scheduler.advance(1_500);
    await autosave.flush();
    expect(autosave.state().status).toBe('saved');
  });
});

describe('autosave: observing and stopping', () => {
  it('tells every subscriber about each state, and stops when they unsubscribe', async () => {
    const { autosave, doc, scheduler } = setup();
    const first: string[] = [];
    const second: string[] = [];
    autosave.subscribe((state) => first.push(state.status));
    const stop = autosave.subscribe((state) => second.push(state.status));
    doc.edit();
    stop();
    await scheduler.advance(1_500);
    expect(first).toEqual(['dirty', 'saving', 'saved']);
    expect(second).toEqual(['dirty']);
  });

  it('every state is a new object, so a UI store can compare by identity', async () => {
    const { autosave, doc, scheduler } = setup();
    const before = autosave.state();
    doc.edit();
    expect(autosave.state()).not.toBe(before);
    expect(autosave.state()).toBe(autosave.state());
    await scheduler.advance(1_500);
  });

  it('dispose with flush saves what is pending, then ignores everything', async () => {
    const { autosave, doc, save, scheduler } = setup();
    doc.edit(2);
    await autosave.dispose({ flush: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(doc.listeners()).toBe(0);
    doc.edit(3);
    await scheduler.advance(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('dispose without flush drops what is pending and leaves no timer behind', async () => {
    const { autosave, doc, save, scheduler } = setup();
    doc.edit(2);
    await autosave.dispose();
    expect(scheduler.pending()).toBe(0);
    await scheduler.advance(60_000);
    expect(save).not.toHaveBeenCalled();
    expect(doc.listeners()).toBe(0);
  });

  it('flush after dispose does nothing', async () => {
    const { autosave, doc, save } = setup();
    await autosave.dispose();
    doc.edit();
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('autosave: leaves no timers behind when idle', () => {
  beforeEach(() => vi.useRealTimers());

  it('has no timer once saved, and one while a change waits', async () => {
    const { doc, scheduler } = setup();
    expect(scheduler.pending()).toBe(0);
    doc.edit();
    expect(scheduler.pending()).toBe(1);
    await scheduler.advance(1_500);
    expect(scheduler.pending()).toBe(0);
  });
});

function fakeJournal() {
  const entries = new Map<string, { name: string; document: SceneDocument }>();
  const journal: Journal = {
    write: vi.fn((projectId, name, document) => {
      entries.set(projectId, { name, document });
      return true;
    }),
    read: vi.fn(() => null),
    clear: vi.fn((projectId) => void entries.delete(projectId)),
  };
  return { journal, entries };
}

describe('autosave: the journal (the page is going away)', () => {
  it('writes the unsaved document down, synchronously, under the project and its name', () => {
    const { journal, entries } = fakeJournal();
    const { autosave, doc } = setup({ journal, name: () => 'Gaming room' });
    const edited = doc.edit(3);
    autosave.journalNow();
    expect(entries.get('p1')).toEqual({ name: 'Gaming room', document: edited });
  });

  it('writes nothing when there is nothing unsaved', () => {
    const { journal } = fakeJournal();
    const { autosave } = setup({ journal });
    autosave.journalNow();
    expect(journal.write).not.toHaveBeenCalled();
  });

  it('clears the journal once the real write succeeded', async () => {
    const { journal, entries } = fakeJournal();
    const { autosave, doc, scheduler } = setup({ journal });
    doc.edit();
    autosave.journalNow();
    expect(entries.has('p1')).toBe(true);
    await scheduler.advance(1_500);
    expect(autosave.state().status).toBe('saved');
    expect(journal.clear).toHaveBeenCalledWith('p1');
    expect(entries.has('p1')).toBe(false);
  });

  it('keeps the journal when the real write failed: it is all that is left', async () => {
    const { journal, entries } = fakeJournal();
    const { autosave, doc, scheduler, save } = setup({ journal });
    save.mockRejectedValue(new RepositoryError('QUOTA_EXCEEDED', 'full'));
    doc.edit();
    autosave.journalNow();
    await scheduler.advance(1_500);
    expect(autosave.state().status).toBe('error');
    expect(entries.has('p1')).toBe(true);
    expect(journal.clear).not.toHaveBeenCalled();
  });

  it('keeps the journal when more was done while the write was going', async () => {
    const { journal } = fakeJournal();
    const context = setup({ journal });
    const waiting = slowSave(context);
    context.doc.edit(1);
    await context.scheduler.advance(1_500);
    context.doc.edit(2);
    context.autosave.journalNow();
    waiting[0]?.finish();
    await context.scheduler.advance(0);
    // The first write finished, but the document moved on: the journal is not cleared by it.
    expect(journal.clear).not.toHaveBeenCalled();
  });

  it('does nothing after dispose, and nothing without a journal', async () => {
    const { journal } = fakeJournal();
    const { autosave, doc } = setup({ journal });
    doc.edit();
    await autosave.dispose();
    autosave.journalNow();
    expect(journal.write).not.toHaveBeenCalled();
    const bare = setup();
    bare.doc.edit();
    expect(() => bare.autosave.journalNow()).not.toThrow();
  });
});
