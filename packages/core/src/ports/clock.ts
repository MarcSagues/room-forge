/** Time source in milliseconds; injected so history coalescing and autosave are testable. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
