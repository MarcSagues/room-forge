'use client';

import type { ReactElement } from 'react';
import { formatCombo } from '@/editor';
import { Kbd } from '@/ui/components/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/components/tooltip';
import { useOptionalShortcutRegistry } from './shortcuts-context';

/**
 * A tooltip with `label` and, when the shortcut `shortcutId` is registered, its keys (DESIGN_SYSTEM
 * §4: every control names its shortcut). The keys come from the registry, so they cannot drift
 * from what the keyboard really does.
 */
export function ShortcutTooltip({
  label,
  shortcutId,
  children,
}: {
  label: string;
  shortcutId?: string;
  children: ReactElement;
}) {
  const registry = useOptionalShortcutRegistry();
  const combo = shortcutId
    ? registry?.list().find((def) => def.id === shortcutId)?.keys[0]
    : undefined;
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top">
          {label}
          {combo && registry
            ? formatCombo(combo, registry.isMac).map((part) => <Kbd key={part}>{part}</Kbd>)
            : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
