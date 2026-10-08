export interface FakeClock {
  now(): number;
  advance(ms: number): void;
  set(ms: number): void;
}

/** Controllable clock for tests (history coalescing windows, autosave debounce...). */
export function createFakeClock(start = 0): FakeClock {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    },
    set(ms) {
      current = ms;
    },
  };
}
