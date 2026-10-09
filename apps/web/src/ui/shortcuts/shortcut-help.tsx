'use client';

import { KeyboardIcon } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { formatCombo, type ShortcutDef } from '@/editor';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog';
import { Kbd } from '@/ui/components/kbd';
import { type MessageKey, translate } from '@/ui/i18n';
import { useRegisterShortcuts, useShortcutRegistry } from './shortcuts-context';

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

/**
 * The shortcuts dialog (P3-08): opens with `?` or from its button, and lists exactly what is
 * registered, so a module that registers a shortcut shows up here with no extra work.
 */
export function ShortcutHelp() {
  const registry = useShortcutRegistry();
  const [open, setOpen] = useState(false);

  const help = useMemo<ShortcutDef[]>(
    () => [
      {
        id: 'help.shortcuts',
        keys: [{ key: '?', shift: 'any' }],
        category: 'help',
        description: 'shortcut.help',
        handler: () => setOpen((current) => !current),
      },
    ],
    [],
  );
  useRegisterShortcuts(help);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('shortcuts.open')}
        title={t('shortcuts.open')}
        onClick={() => setOpen(true)}
      >
        <KeyboardIcon />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
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
    </>
  );
}
