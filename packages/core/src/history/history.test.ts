import type { Patch } from 'immer';
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../testing';
import { createHistory, type HistoryEntry } from './history';

const patch = (value: number): Patch => ({ op: 'replace', path: ['lighting', 'ambient'], value });

function entry(label: string, value: number, mergeKey?: string): Omit<HistoryEntry, 'at'> {
  return {
    label,
    patches: [patch(value)],
    inverse: [patch(-value)],
    ...(mergeKey === undefined ? {} : { mergeKey }),
  };
}

function setup(options: { limit?: number; mergeWindowMs?: number } = {}) {
  const clock = createFakeClock(0);
  return { clock, history: createHistory({ clock, ...options }) };
}

describe('createHistory', () => {
  it('starts empty', () => {
    const { history } = setup();
    expect(history.status()).toEqual({
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
    });
    expect(history.undo()).toBeUndefined();
    expect(history.redo()).toBeUndefined();
  });

  it('undoes and redoes entries in order, reporting their labels', () => {
    const { history } = setup();
    history.push(entry('A', 1));
    history.push(entry('B', 2));
    expect(history.status()).toMatchObject({ canUndo: true, undoLabel: 'B', canRedo: false });

    expect(history.undo()?.label).toBe('B');
    expect(history.status()).toMatchObject({ undoLabel: 'A', redoLabel: 'B', canRedo: true });
    expect(history.undo()?.label).toBe('A');
    expect(history.status().canUndo).toBe(false);

    expect(history.redo()?.label).toBe('A');
    expect(history.redo()?.label).toBe('B');
    expect(history.status().canRedo).toBe(false);
  });

  it('drops the redo branch when a new entry is pushed after undo', () => {
    const { history } = setup();
    history.push(entry('A', 1));
    history.push(entry('B', 2));
    history.undo();
    history.push(entry('C', 3));
    expect(history.status()).toMatchObject({ canRedo: false, undoLabel: 'C' });
    expect(history.size()).toBe(2);
  });

  describe('coalescing', () => {
    it('merges entries with the same mergeKey within the window', () => {
      const { history, clock } = setup();
      history.push(entry('Move', 1, 'move:a'));
      clock.advance(200);
      history.push(entry('Move', 2, 'move:a'));
      clock.advance(599); // the window slides with each merged command
      history.push(entry('Move', 3, 'move:a'));

      expect(history.size()).toBe(1);
      const merged = history.undo();
      expect(merged?.patches).toEqual([patch(1), patch(2), patch(3)]);
      expect(merged?.inverse).toEqual([patch(-3), patch(-2), patch(-1)]);
    });

    it('starts a new entry after the window, for another key or without a key', () => {
      const { history, clock } = setup();
      history.push(entry('Move', 1, 'move:a'));
      clock.advance(601);
      history.push(entry('Move', 2, 'move:a'));
      expect(history.size()).toBe(2);

      history.push(entry('Move', 3, 'move:b'));
      history.push(entry('Rename', 4));
      history.push(entry('Rename', 5));
      expect(history.size()).toBe(5);
    });

    it('never merges into an entry that was undone and redone', () => {
      const { history } = setup();
      history.push(entry('Move', 1, 'move:a'));
      history.undo();
      history.redo();
      history.push(entry('Move', 2, 'move:a'));
      expect(history.size()).toBe(2);
    });
  });

  it('keeps at most `limit` entries, dropping the oldest', () => {
    const { history } = setup({ limit: 3 });
    for (const label of ['A', 'B', 'C', 'D', 'E']) history.push(entry(label, 1));
    expect(history.size()).toBe(3);
    const undone = [history.undo(), history.undo(), history.undo(), history.undo()];
    expect(undone.map((e) => e?.label)).toEqual(['E', 'D', 'C', undefined]);
  });

  it('defaults to 200 entries and a 600 ms window', () => {
    const { history, clock } = setup();
    for (let i = 0; i < 250; i += 1) history.push(entry('A', i));
    expect(history.size()).toBe(200);

    const fresh = setup();
    fresh.history.push(entry('A', 1, 'k'));
    fresh.clock.advance(600);
    fresh.history.push(entry('A', 2, 'k'));
    expect(fresh.history.size()).toBe(1);
    expect(clock.now()).toBe(0);
  });

  it('can be cleared', () => {
    const { history } = setup();
    history.push(entry('A', 1));
    history.clear();
    expect(history.status().canUndo).toBe(false);
  });
});
