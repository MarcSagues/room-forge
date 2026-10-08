'use client';

import type { EntityId } from '@roomforge/core';
import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
import type { Object3D } from 'three';

/**
 * `EntityId → Object3D` for controllers that move objects without React (drag, gizmos). Views
 * register through `useRegisterEntity`; the entry goes away when the view unmounts.
 */
export interface EntityRegistry {
  get(id: EntityId): Object3D | undefined;
  readonly size: number;
  /** Mounted entities, for picking (no copy: do not register while iterating). */
  entries(): IterableIterator<[EntityId, Object3D]>;
  /** Returns the unregister function. Re-registering an id replaces the previous object. */
  register(id: EntityId, object: Object3D): () => void;
}

export function createEntityRegistry(): EntityRegistry {
  const objects = new Map<EntityId, Object3D>();
  return {
    get: (id) => objects.get(id),
    get size() {
      return objects.size;
    },
    entries: () => objects.entries(),
    register(id, object) {
      objects.set(id, object);
      return () => {
        // A newer view may already own the id (remount with the same key): leave it alone.
        if (objects.get(id) === object) objects.delete(id);
      };
    },
  };
}

const RegistryContext = createContext<EntityRegistry | null>(null);

export function EntityRegistryProvider(props: { registry?: EntityRegistry; children: ReactNode }) {
  const fallback = useMemo(() => createEntityRegistry(), []);
  return (
    <RegistryContext.Provider value={props.registry ?? fallback}>
      {props.children}
    </RegistryContext.Provider>
  );
}

export function useEntityRegistry(): EntityRegistry {
  const registry = useContext(RegistryContext);
  if (!registry) throw new Error('useEntityRegistry must be used inside <EntityRegistryProvider>');
  return registry;
}

/** Ref callback that keeps the registry in sync with the mounted Object3D (React 19 ref cleanup). */
export function useRegisterEntity(
  id: EntityId,
): (object: Object3D | null) => (() => void) | undefined {
  const registry = useEntityRegistry();
  return useCallback(
    (object: Object3D | null) => (object ? registry.register(id, object) : undefined),
    [registry, id],
  );
}
