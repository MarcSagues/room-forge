'use client';

import type { EditorSession } from '@roomforge/core';
import { Redo2Icon, Undo2Icon } from 'lucide-react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/ui/components/button';
import { translate } from '@/ui/i18n';
import { ShortcutTooltip } from '@/ui/shortcuts/shortcut-tooltip';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

/**
 * Undo and redo for the top bar. Each names what it would do ("Undo: Move object") in its label
 * and tooltip (with its shortcut), and is disabled when there is nothing to undo or redo.
 */
export function HistoryButtons({ session }: { session: EditorSession }) {
  const history = useStore(
    session.store,
    useShallow((state) => state.history),
  );
  const undo = history.canUndo
    ? t('history.undoLabel', { label: history.undoLabel ?? t('shell.undo') })
    : t('history.nothingToUndo');
  const redo = history.canRedo
    ? t('history.redoLabel', { label: history.redoLabel ?? t('shell.redo') })
    : t('history.nothingToRedo');
  return (
    <div className="ml-2 flex items-center gap-1">
      <ShortcutTooltip label={undo} shortcutId="edit.undo">
        <Button
          variant="ghost"
          size="icon"
          disabled={!history.canUndo}
          aria-label={undo}
          onClick={() => session.undo()}
        >
          <Undo2Icon />
        </Button>
      </ShortcutTooltip>
      <ShortcutTooltip label={redo} shortcutId="edit.redo">
        <Button
          variant="ghost"
          size="icon"
          disabled={!history.canRedo}
          aria-label={redo}
          onClick={() => session.redo()}
        >
          <Redo2Icon />
        </Button>
      </ShortcutTooltip>
    </div>
  );
}
