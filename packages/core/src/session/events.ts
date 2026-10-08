import type { Patch } from 'immer';
import type { HistoryStatus } from '../history';
import type { EntityId } from './selection';
import type { CommandError } from './types';

export interface SessionEvents {
  'document:changed': { patches: readonly Patch[]; source: 'command' | 'undo' | 'redo' | 'load' };
  'history:changed': HistoryStatus;
  'selection:changed': { ids: readonly EntityId[] };
  'gesture:started': { label: string };
  'gesture:ended': { label: string; committed: boolean };
  'session:error': { error: CommandError };
}

export type Unsubscribe = () => void;

export interface Emitter<E> {
  on<K extends keyof E>(type: K, handler: (payload: E[K]) => void): Unsubscribe;
  emit<K extends keyof E>(type: K, payload: E[K]): void;
  /** Registered handlers, for one event or all of them (leak checks in tests and dev tools). */
  listenerCount(type?: keyof E): number;
}

/**
 * Minimal typed emitter for side effects (autosave, render invalidation). Every handler runs even
 * if one throws; the first error is rethrown afterwards so it is not swallowed.
 */
export function createEmitter<E>(): Emitter<E> {
  const handlers = new Map<keyof E, Set<(payload: never) => void>>();
  return {
    on(type, handler) {
      const set = handlers.get(type) ?? new Set();
      set.add(handler as (payload: never) => void);
      handlers.set(type, set);
      return () => {
        set.delete(handler as (payload: never) => void);
        if (set.size === 0) handlers.delete(type);
      };
    },
    listenerCount(type) {
      if (type !== undefined) return handlers.get(type)?.size ?? 0;
      let total = 0;
      for (const set of handlers.values()) total += set.size;
      return total;
    },
    emit(type, payload) {
      let failure: { error: unknown } | undefined;
      for (const handler of [...(handlers.get(type) ?? [])]) {
        try {
          (handler as (payload: E[typeof type]) => void)(payload);
        } catch (error) {
          failure ??= { error };
        }
      }
      if (failure) throw failure.error;
    },
  };
}
