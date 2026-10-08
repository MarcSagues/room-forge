/**
 * Render counter for the granular-subscription quality gate (P2-09). Off by default: components
 * call `countRender(key)` on every render, which costs one null check unless a test switched it on.
 */
let counts: Map<string, number> | null = null;

export function countRender(key: string): void {
  if (counts) counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Starts counting from zero and returns the live counts. */
export function startRenderCounting(): ReadonlyMap<string, number> {
  counts = new Map();
  return counts;
}

export function stopRenderCounting(): void {
  counts = null;
}

export const renderCount = (key: string): number => counts?.get(key) ?? 0;
