'use client';

import { useMemo, useRef } from 'react';
import type { ShortcutDef } from '@/editor';
import { useRegisterShortcuts } from '@/ui/shortcuts/shortcuts-context';

/**
 * `[` toggles the left panel and `]` the right one (DESIGN_SYSTEM §4). They are shortcuts like any
 * other: registered while the shell is mounted, so the help dialog lists them. The handlers are
 * read through a ref, so the registration is made once and keeps its place in the list.
 */
export function usePanelHotkeys(handlers: { left: () => void; right: () => void }) {
  const latest = useRef(handlers);
  latest.current = handlers;
  const defs = useMemo<ShortcutDef[]>(
    () => [
      {
        id: 'panels.left',
        keys: [{ key: '[', shift: 'any' }],
        category: 'panels',
        description: 'shortcut.leftPanel',
        handler: () => latest.current.left(),
      },
      {
        id: 'panels.right',
        keys: [{ key: ']', shift: 'any' }],
        category: 'panels',
        description: 'shortcut.rightPanel',
        handler: () => latest.current.right(),
      },
    ],
    [],
  );
  useRegisterShortcuts(defs);
}
