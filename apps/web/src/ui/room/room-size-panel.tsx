'use client';

import {
  type EditorSession,
  type EntityId,
  LIMITS,
  type RoomId,
  resizeRoom,
} from '@roomforge/core';
import { type KeyboardEvent, useId, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { translate } from '@/ui/i18n';
import { cn } from '@/ui/lib/utils';
import { PanelHint } from '@/ui/shell/side-panel';
import { checkLength, formatLength, type LengthCheck, type LengthUnit } from './lengths';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

type Field = 'width' | 'depth' | 'height';

const FIELDS: readonly { field: Field; label: 'room.width' | 'room.depth' | 'room.height' }[] = [
  { field: 'width', label: 'room.width' },
  { field: 'depth', label: 'room.depth' },
  { field: 'height', label: 'room.height' },
];

const RANGES = {
  width: LIMITS.roomSide,
  depth: LIMITS.roomSide,
  height: LIMITS.roomHeight,
} as const;

const UNITS: readonly LengthUnit[] = ['m', 'cm'];

interface Conflict {
  /** What is left outside, by name, to show. */
  names: readonly string[];
  ids: readonly EntityId[];
}

function describe(unit: LengthUnit, field: Field, check: Extract<LengthCheck, { ok: false }>) {
  const range = RANGES[field];
  const vars = { min: formatLength(range.min, unit), max: formatLength(range.max, unit), unit };
  if (check.reason === 'empty') return t('room.error.empty');
  if (check.reason === 'nan') return t('room.error.nan');
  return t(check.reason === 'min' ? 'room.error.min' : 'room.error.max', vars);
}

/**
 * Width, depth and height of the room, in metres or centimetres. Each value is checked as it is
 * typed and the change cannot be confirmed while one is wrong. When shrinking would leave
 * something outside the room the command refuses, nothing changes, and the panel lists what is in
 * the way, with a button that selects it.
 */
export function RoomSizePanel({ session }: { session: EditorSession }) {
  const titleId = useId();
  const [unit, setUnit] = useState<LengthUnit>('m');
  const [drafts, setDrafts] = useState<Partial<Record<Field, string>>>({});
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [failed, setFailed] = useState(false);

  const { roomId, width, depth, height } = useStore(
    session.store,
    useShallow((state) => {
      const id = state.document.roomOrder[0] as RoomId | undefined;
      const room = id ? state.document.rooms[id] : undefined;
      return {
        roomId: id,
        width: room?.shape.width,
        depth: room?.shape.depth,
        height: room?.height,
      };
    }),
  );
  const current = { width, depth, height };
  if (!roomId || width === undefined || depth === undefined || height === undefined) {
    return <PanelHint>{t('materials.noRoom')}</PanelHint>;
  }

  const textOf = (field: Field) => drafts[field] ?? formatLength(current[field] as number, unit);
  const checks = Object.fromEntries(
    FIELDS.map(({ field }) => [field, checkLength(textOf(field), unit, RANGES[field])]),
  ) as Record<Field, LengthCheck>;
  const valid = FIELDS.every(({ field }) => checks[field].ok);
  const changed = FIELDS.some(({ field }) => {
    const check = checks[field];
    return check.ok && check.metres !== current[field];
  });

  const edit = (field: Field, text: string) => {
    setDrafts((previous) => ({ ...previous, [field]: text }));
    setConflict(null);
    setFailed(false);
  };

  const changeUnit = (next: LengthUnit) => {
    if (next === unit) return;
    // What was typed keeps its value: a valid draft is shown again in the new unit.
    setDrafts((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([field, text]) => {
          const check = checkLength(text, unit, RANGES[field as Field]);
          return [field, check.ok ? formatLength(check.metres, next) : text];
        }),
      ),
    );
    setUnit(next);
  };

  const apply = () => {
    if (!valid || !changed) return;
    const size: Partial<Record<Field, number>> = {};
    for (const { field } of FIELDS) {
      const check = checks[field];
      if (check.ok && check.metres !== current[field]) size[field] = check.metres;
    }
    const result = session.execute(resizeRoom(roomId, size));
    if (result.ok) {
      setDrafts({});
      setConflict(null);
      setFailed(false);
      return;
    }
    if (result.error.code === 'conflict') {
      const document = session.getState().document;
      const ids = (result.error.conflicts ?? []) as EntityId[];
      setConflict({
        ids,
        names: ids.map((id) => {
          const object = document.objects[id as keyof typeof document.objects];
          return object?.name ?? object?.catalogId ?? id;
        }),
      });
      return;
    }
    setFailed(true);
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') apply();
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="font-medium text-fg">
          {t('room.title')}
        </h2>
        <fieldset className="flex gap-1">
          <legend className="sr-only">{t('room.unit')}</legend>
          {UNITS.map((entry) => (
            <Button
              key={entry}
              type="button"
              size="xs"
              variant={entry === unit ? 'secondary' : 'ghost'}
              aria-pressed={entry === unit}
              onClick={() => changeUnit(entry)}
            >
              {entry}
            </Button>
          ))}
        </fieldset>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {FIELDS.map(({ field, label }) => {
          const check = checks[field];
          const errorId = `${titleId}-${field}-error`;
          return (
            <div key={field} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${titleId}-${field}`} className="text-fg-muted text-xs">
                {t(label)}
              </label>
              <Input
                id={`${titleId}-${field}`}
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                value={textOf(field)}
                aria-invalid={!check.ok}
                aria-describedby={check.ok ? undefined : errorId}
                onChange={(event) => edit(field, event.target.value)}
                onKeyDown={onKey}
              />
              {check.ok ? null : (
                <p id={errorId} role="alert" className="text-destructive text-xs">
                  {describe(unit, field, check)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-fg-subtle text-xs">
        {t('room.range', {
          min: formatLength(LIMITS.roomSide.min, unit),
          max: formatLength(LIMITS.roomSide.max, unit),
          unit,
        })}
      </p>

      <Button type="button" size="sm" disabled={!valid || !changed} onClick={apply}>
        {t('room.apply')}
      </Button>

      {conflict ? (
        <div
          role="alert"
          className={cn('flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm')}
        >
          <p>{t('room.conflictTitle')}</p>
          <ul className="list-disc pl-5">
            {conflict.names.map((name, index) => (
              // Two objects can share a name: the position in the list is what tells them apart.
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list built once per attempt
              <li key={index}>{name}</li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => session.select(conflict.ids)}
          >
            {t('room.viewObjects')}
          </Button>
        </div>
      ) : null}
      {failed ? (
        <p role="alert" className="text-destructive text-xs">
          {t('room.failed')}
        </p>
      ) : null}
    </section>
  );
}
