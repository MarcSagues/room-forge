import type { ModelPart } from '@/asset-library';

export type { ModelPart };

export type ModelStatus = 'loading' | 'ready' | 'error';

/** Where a model stands. The same object until the status changes, so it can be React state. */
export interface ModelSnapshot {
  readonly status: ModelStatus;
  readonly parts: readonly ModelPart[] | null;
}

/** One object's hold on a model. */
export interface ModelLease {
  snapshot(): ModelSnapshot;
  /** Lets go; the model is freed with its last user. Safe to call twice. */
  release(): void;
}

export interface ModelRegistry {
  /** Holds the model at `url`, loading it if nobody does yet; `listener` hears when it changes. */
  acquire(url: string, listener: () => void): ModelLease;
  stats(): { models: number; leases: number; geometries: number };
  /** Frees everything; leases left become inert. */
  dispose(): void;
}

export interface ModelRegistryOptions {
  load(url: string): Promise<readonly ModelPart[]>;
  /** Called when a model arrives or fails, so the scene can ask for a frame (rule 4). */
  onChange?: () => void;
}

interface Entry {
  snapshot: ModelSnapshot;
  readonly listeners: Set<() => void>;
}

const LOADING: ModelSnapshot = { status: 'loading', parts: null };
const FAILED: ModelSnapshot = { status: 'error', parts: null };

function free(snapshot: ModelSnapshot): void {
  for (const part of snapshot.parts ?? []) part.geometry.dispose();
}

/**
 * The ResourceRegistry of catalog models (P4-04, AGENTS rule 6): one load and one set of
 * geometries per model URL, shared by every object that shows it, with a reference count. When
 * the last object lets go the geometries are disposed, one microtask later, so that React
 * unmounting and remounting a view in the same commit (Strict Mode, a re-parent) does not reload
 * the model. A failed load is kept only while someone holds it: the next object retries.
 */
export function createModelRegistry(options: ModelRegistryOptions): ModelRegistry {
  const entries = new Map<string, Entry>();
  let leases = 0;
  let stopped = false;

  function start(url: string): Entry {
    const entry: Entry = { snapshot: LOADING, listeners: new Set() };
    entries.set(url, entry);
    const settle = (next: ModelSnapshot) => {
      if (stopped || entries.get(url) !== entry) {
        free(next); // nobody wants it any more
        return;
      }
      entry.snapshot = next;
      for (const listener of entry.listeners) listener();
      options.onChange?.();
    };
    options.load(url).then(
      (parts) => settle({ status: 'ready', parts }),
      () => settle(FAILED),
    );
    return entry;
  }

  function evictIfUnused(url: string, entry: Entry): void {
    if (entry.listeners.size > 0 || entries.get(url) !== entry) return;
    entries.delete(url);
    free(entry.snapshot);
  }

  return {
    acquire(url, listener) {
      const entry = entries.get(url) ?? start(url);
      // A listener per lease, even when two leases pass the same function.
      const own = () => listener();
      entry.listeners.add(own);
      leases += 1;
      let active = true;
      return {
        snapshot: () => entry.snapshot,
        release() {
          if (!active || stopped) return;
          active = false;
          leases -= 1;
          entry.listeners.delete(own);
          queueMicrotask(() => evictIfUnused(url, entry));
        },
      };
    },
    stats() {
      let geometries = 0;
      for (const entry of entries.values()) geometries += entry.snapshot.parts?.length ?? 0;
      return { models: entries.size, leases, geometries };
    },
    dispose() {
      stopped = true;
      for (const entry of entries.values()) {
        entry.listeners.clear();
        free(entry.snapshot);
      }
      entries.clear();
      leases = 0;
    },
  };
}
