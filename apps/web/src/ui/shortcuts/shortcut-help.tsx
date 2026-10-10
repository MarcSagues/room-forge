'use client';

import { KeyboardIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { ShortcutDef } from '@/editor';
import { Button } from '@/ui/components/button';
import { type MessageKey, translate } from '@/ui/i18n';
import { useRegisterShortcuts } from './shortcuts-context';

const t = (key: MessageKey) => translate('en', key);

// The dialog (and Radix Dialog with it) is not needed to draw the editor: it loads when first
// opened (the `/editor/` bundle budget, P7-04).
const ShortcutHelpDialog = dynamic(
  () => import('./shortcut-help-dialog').then((module) => module.ShortcutHelpDialog),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="sr-only">
        {t('shell.panelLoading')}
      </p>
    ),
  },
);

/**
 * The shortcuts dialog (P3-08): opens with `?` or from its button, and lists exactly what is
 * registered, so a module that registers a shortcut shows up here with no extra work.
 */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  // Mounted from the first opening on, so that closing keeps its exit animation.
  const [opened, setOpened] = useState(false);
  if (open && !opened) setOpened(true);

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
      {opened ? <ShortcutHelpDialog open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
