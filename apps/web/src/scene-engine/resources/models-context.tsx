'use client';

import { useThree } from '@react-three/fiber';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { loadModelParts } from '@/asset-library';
import {
  createModelRegistry,
  type ModelPart,
  type ModelRegistry,
  type ModelSnapshot,
} from './model-registry';

const ModelsContext = createContext<ModelRegistry | null>(null);

/**
 * Gives the scene its one model registry, made with the renderer and freed with it, like the
 * material factory. A model arriving asks for a frame (rule 4: the canvas renders on demand).
 */
export function ModelsProvider({
  children,
  load = loadModelParts,
}: {
  children: ReactNode;
  /** How a model is fetched; tests pass their own. */
  load?: (url: string) => Promise<readonly ModelPart[]>;
}) {
  const invalidate = useThree((state) => state.invalidate);
  // Made in an effect so the registry a Strict Mode cleanup disposes is not the one kept.
  const [registry, setRegistry] = useState<ModelRegistry | null>(null);
  useEffect(() => {
    const made = createModelRegistry({ load, onChange: () => invalidate() });
    setRegistry(made);
    return () => {
      made.dispose();
      setRegistry(null);
    };
  }, [load, invalidate]);
  if (!registry) return null;
  return <ModelsContext.Provider value={registry}>{children}</ModelsContext.Provider>;
}

const LOADING: ModelSnapshot = { status: 'loading', parts: null };

/**
 * The model at `url` for as long as the component shows it. Re-renders only when its status
 * changes (loading → ready or error), never per frame. Without a registry (tests that draw only
 * placeholders) it stays `loading`.
 */
export function useModel(url: string): ModelSnapshot {
  const registry = useContext(ModelsContext);
  const [snapshot, setSnapshot] = useState(LOADING);
  useEffect(() => {
    if (!registry) return;
    const lease = registry.acquire(url, () => setSnapshot(lease.snapshot()));
    setSnapshot(lease.snapshot());
    return () => lease.release();
  }, [registry, url]);
  return snapshot;
}
