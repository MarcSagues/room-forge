'use client';

import { createContext, type ReactNode, useContext, useEffect } from 'react';
import type { ShortcutDef, ShortcutRegistry } from '@/editor';

const ShortcutsContext = createContext<ShortcutRegistry | null>(null);

/** Gives the components below access to the shortcut registry (one per editor). */
export function ShortcutsProvider({
  registry,
  children,
}: {
  registry: ShortcutRegistry;
  children: ReactNode;
}) {
  return <ShortcutsContext.Provider value={registry}>{children}</ShortcutsContext.Provider>;
}

export function useShortcutRegistry(): ShortcutRegistry {
  const registry = useContext(ShortcutsContext);
  if (!registry) throw new Error('useShortcutRegistry must be used inside <ShortcutsProvider>');
  return registry;
}

/**
 * Registers `defs` while the component is mounted. Pass a stable array (memoised or module-level):
 * a new one every render would re-register them, which moves them to the end of the help list.
 */
export function useRegisterShortcuts(defs: readonly ShortcutDef[]) {
  const registry = useShortcutRegistry();
  useEffect(() => registry.registerAll(defs), [registry, defs]);
}
