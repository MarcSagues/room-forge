'use client';

import {
  type Command,
  type EditorSession,
  type OpeningId,
  setDoorOpen,
  setDoorSwing,
} from '@roomforge/core';
import { useId, useState } from 'react';
import { useStore } from 'zustand';
import { type MessageKey, translate } from '@/ui/i18n';
import { SwitchRow } from './object-properties';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

/**
 * The Properties tab for a selected door (P10-02): open or closed, which way it swings and where
 * its hinge is. Each switch is one command, so one history entry; a refusal (the leaf would cross
 * a wall) is said next to the switches.
 */
export function DoorProperties({ session, id }: { session: EditorSession; id: OpeningId }) {
  const door = useStore(session.store, (state) => state.document.openings[id]);
  const prefix = useId();
  const [error, setError] = useState<string | null>(null);
  if (door?.kind !== 'door') return null;

  const run = (command: Command) => {
    const result = session.execute(command);
    setError(
      result.ok ? null : t(result.error.code === 'blocked' ? 'door.blocked' : 'properties.refused'),
    );
  };
  const wall = t(`outliner.wall.${door.wall}` as MessageKey);

  return (
    <section aria-labelledby={`${prefix}-title`} className="flex flex-col gap-4 p-4">
      <h2 id={`${prefix}-title`} className="truncate font-medium text-fg">
        {t('outliner.door', { wall })}
      </h2>
      <div className="flex flex-col gap-2">
        <SwitchRow
          id={`${prefix}-open`}
          label={t('door.open')}
          checked={(door.open ?? 0) > 0}
          onChange={(open) => run(setDoorOpen(id, open ? 1 : 0))}
        />
        <SwitchRow
          id={`${prefix}-swing`}
          label={t('door.swingOut')}
          checked={door.swing === 'out'}
          onChange={(out) => run(setDoorSwing(id, { swing: out ? 'out' : 'in' }))}
        />
        <SwitchRow
          id={`${prefix}-hinge`}
          label={t('door.hingeRight')}
          checked={door.hinge === 'right'}
          onChange={(right) => run(setDoorSwing(id, { hinge: right ? 'right' : 'left' }))}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </section>
  );
}
