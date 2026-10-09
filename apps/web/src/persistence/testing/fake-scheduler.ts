import type { FakeClock } from '@roomforge/core/testing';
import type { Scheduler } from '../autosave';

export interface FakeScheduler extends Scheduler {
  /** Timers waiting to fire. */
  pending(): number;
  /**
   * Moves time forward by `ms`: fires every timer that falls due, in order, letting the promises
   * they start finish before the next one, and leaves the clock `ms` later.
   */
  advance(ms: number): Promise<void>;
}

/** Lets already-resolved promises run (a save is a few `await`s deep). */
async function drain(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * Timers on the fake clock, for tests of code that waits (debounce, retry): nothing depends on real
 * time and a test says exactly how much of it passes.
 */
export function createFakeScheduler(clock: FakeClock): FakeScheduler {
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    setTimeout(callback, ms) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: clock.now() + ms, callback });
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    pending: () => timers.size,
    async advance(ms) {
      const target = clock.now() + ms;
      await drain();
      for (;;) {
        let due: [number, { at: number; callback: () => void }] | undefined;
        for (const entry of timers) {
          if (entry[1].at <= target && (!due || entry[1].at < due[1].at)) due = entry;
        }
        if (!due) break;
        timers.delete(due[0]);
        clock.set(Math.max(clock.now(), due[1].at));
        due[1].callback();
        await drain();
      }
      clock.set(target);
      await drain();
    },
  };
}
