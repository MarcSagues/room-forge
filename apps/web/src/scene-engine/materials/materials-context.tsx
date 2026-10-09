'use client';

import { useThree } from '@react-three/fiber';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { createMaterialFactory, type MaterialFactory } from './material-factory';

const MaterialFactoryContext = createContext<MaterialFactory | null>(null);

/** The most texture filtering used however capable the GPU is; the quality settings may change it. */
const DEFAULT_ANISOTROPY = 4;

/**
 * Gives the scene its one material factory (AGENTS rule 6). It lives with the canvas: made when
 * the renderer exists, freed when it goes, and it asks for a frame whenever it changes a material
 * in place (rule 4), which is what makes dragging a colour show without re-rendering React.
 */
export function MaterialsProvider({ children }: { children: ReactNode }) {
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  // Made in an effect, not during render: Strict Mode runs effects twice, and a factory disposed
  // by the first cleanup must not be the one the second run keeps.
  const [factory, setFactory] = useState<MaterialFactory | null>(null);
  useEffect(() => {
    const made = createMaterialFactory({
      anisotropy: Math.min(DEFAULT_ANISOTROPY, gl.capabilities.getMaxAnisotropy()),
      onMutate: () => invalidate(),
    });
    setFactory(made);
    return () => {
      made.dispose();
      setFactory(null);
    };
  }, [gl, invalidate]);
  if (!factory) return null;
  return (
    <MaterialFactoryContext.Provider value={factory}>{children}</MaterialFactoryContext.Provider>
  );
}

export function useMaterialFactory(): MaterialFactory {
  const factory = useContext(MaterialFactoryContext);
  if (!factory) throw new Error('useMaterialFactory must be used inside <SceneCanvas>');
  return factory;
}
