'use client';

import { Fragment } from 'react';
import { formatCombo, type ShortcutDef } from '@/editor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog';
import { Kbd } from '@/ui/components/kbd';
import { type MessageKey, translate } from '@/ui/i18n';
import { useShortcutRegistry } from './shortcuts-context';

const t = (key: MessageKey) => translate('en', key);

/** Order of the sections; any other section a module invents goes after these. */
const CATEGORY_ORDER = ['edit', 'selection', 'view', 'panels', 'help'];

function groupByCategory(defs: readonly ShortcutDef[]): [string, ShortcutDef[]][] {
  const groups = new Map<string, ShortcutDef[]>();
  for (const def of defs) groups.set(def.category, [...(groups.get(def.category) ?? []), def]);
  const rank = (category: string) => {
    const index = CATEGORY_ORDER.indexOf(category);
    return index === -1 ? CATEGORY_ORDER.length : index;
  };
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

/** The dialog of `ShortcutHelp`, in its own chunk: it loads the first time it opens. */
export function ShortcutHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const registry = useShortcutRegistry();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('shortcuts.description')}</DialogDescription>
        </DialogHeader>
        {open &&
          groupByCategory(registry.list()).map(([category, defs]) => (
            <section key={category} className="flex flex-col gap-1">
              <h3 className="font-medium text-fg-muted text-xs uppercase tracking-wide">
                {t(`shortcut.category.${category}` as MessageKey)}
              </h3>
              <ul className="flex flex-col">
                {defs.map((def) => (
                  <li
                    key={def.id}
                    className="flex items-center justify-between gap-4 border-subtle border-b py-1.5 last:border-b-0"
                  >
                    <span className="text-sm">{t(def.description as MessageKey)}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {def.keys.map((combo, index) => (
                        <Fragment key={JSON.stringify(combo)}>
                          {index > 0 && (
                            <span className="text-fg-subtle text-xs">{t('shortcuts.or')}</span>
                          )}
                          <span className="flex items-center gap-1">
                            {formatCombo(combo, registry.isMac).map((part) => (
                              <Kbd key={part}>{part}</Kbd>
                            ))}
                          </span>
                        </Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </DialogContent>
    </Dialog>
  );
}
