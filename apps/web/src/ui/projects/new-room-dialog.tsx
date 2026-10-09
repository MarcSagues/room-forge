'use client';

import { DEFAULT_ROOM_SIZE, LIMITS, ROOM_PRESETS, type RoomSize } from '@roomforge/core';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog';
import { Input } from '@/ui/components/input';
import { translate } from '@/ui/i18n';
import { cn } from '@/ui/lib/utils';
import { checkLength, formatLength, type LengthCheck, type LengthUnit } from '../room/lengths';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

type Field = keyof RoomSize;

const FIELDS = [
  { field: 'width', label: 'newRoom.width' },
  { field: 'depth', label: 'newRoom.depth' },
  { field: 'height', label: 'newRoom.height' },
] as const;

const RANGES = {
  width: LIMITS.roomSide,
  depth: LIMITS.roomSide,
  height: LIMITS.roomHeight,
} as const;

const UNITS: readonly LengthUnit[] = ['m', 'cm'];

/** What the dialog opens with: the size a project has when nobody chooses. */
const INITIAL = DEFAULT_ROOM_SIZE;

function errorMessage(unit: LengthUnit, field: Field, check: Extract<LengthCheck, { ok: false }>) {
  const range = RANGES[field];
  const vars = { min: formatLength(range.min, unit), max: formatLength(range.max, unit), unit };
  if (check.reason === 'empty') return t('newRoom.error.empty');
  if (check.reason === 'nan') return t('newRoom.error.nan');
  return t(check.reason === 'min' ? 'newRoom.error.min' : 'newRoom.error.max', vars);
}

export interface NewRoomDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Called with a size that is inside the limits; the dialog closes itself. */
  onCreate(size: RoomSize): void;
}

/**
 * The "new room" wizard (P3-10): presets, the three dimensions in m or cm with inline validation,
 * and a plan of the room drawn as they are typed. A size outside the limits cannot be confirmed.
 */
export function NewRoomDialog({ open, onOpenChange, onCreate }: NewRoomDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* The form is its own component so closing the dialog forgets what was typed. */}
        <NewRoomForm onCancel={() => onOpenChange(false)} onCreate={onCreate} />
      </DialogContent>
    </Dialog>
  );
}

function NewRoomForm({ onCancel, onCreate }: { onCancel(): void; onCreate(size: RoomSize): void }) {
  const id = useId();
  const [unit, setUnit] = useState<LengthUnit>('m');
  const [texts, setTexts] = useState<Record<Field, string>>(() => ({
    width: formatLength(INITIAL.width, 'm'),
    depth: formatLength(INITIAL.depth, 'm'),
    height: formatLength(INITIAL.height, 'm'),
  }));

  const checks = Object.fromEntries(
    FIELDS.map(({ field }) => [field, checkLength(texts[field], unit, RANGES[field])]),
  ) as Record<Field, LengthCheck>;
  const sizes = FIELDS.map(({ field }) => checks[field]);
  const valid = sizes.every((check) => check.ok);

  const metres = (field: Field): number => {
    const check = checks[field];
    return check.ok ? check.metres : INITIAL[field];
  };
  const size: RoomSize = {
    width: metres('width'),
    depth: metres('depth'),
    height: metres('height'),
  };

  const choose = (preset: RoomSize) =>
    setTexts({
      width: formatLength(preset.width, unit),
      depth: formatLength(preset.depth, unit),
      height: formatLength(preset.height, unit),
    });

  const changeUnit = (next: LengthUnit) => {
    if (next === unit) return;
    // What was typed keeps its value: a valid text is shown again in the new unit.
    setTexts((previous) => {
      const converted = { ...previous };
      for (const { field } of FIELDS) {
        const check = checkLength(previous[field], unit, RANGES[field]);
        if (check.ok) converted[field] = formatLength(check.metres, next);
      }
      return converted;
    });
    setUnit(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onCreate(size);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('newRoom.title')}</DialogTitle>
        <DialogDescription>{t('newRoom.description')}</DialogDescription>
      </DialogHeader>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('newRoom.presets')}</legend>
        {ROOM_PRESETS.map((preset) => {
          const selected = FIELDS.every(
            ({ field }) => checks[field].ok && metres(field) === preset[field],
          );
          return (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={selected ? 'secondary' : 'outline'}
              aria-pressed={selected}
              onClick={() => choose(preset)}
            >
              {preset.name.en} · {preset.width} × {preset.depth} m
            </Button>
          );
        })}
      </fieldset>

      <div className="flex items-end gap-3">
        <div className="grid flex-1 grid-cols-3 gap-2">
          {FIELDS.map(({ field, label }) => {
            const check = checks[field];
            const errorId = `${id}-${field}-error`;
            return (
              <div key={field} className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`${id}-${field}`} className="text-fg-muted text-xs">
                  {t(label)}
                </label>
                <Input
                  id={`${id}-${field}`}
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  value={texts[field]}
                  aria-invalid={!check.ok}
                  aria-describedby={check.ok ? undefined : errorId}
                  onChange={(event) =>
                    setTexts((previous) => ({ ...previous, [field]: event.target.value }))
                  }
                />
                {check.ok ? null : (
                  <p id={errorId} role="alert" className="text-destructive text-xs">
                    {errorMessage(unit, field, check)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <fieldset className="flex gap-1 pb-1">
          <legend className="sr-only">{t('newRoom.unit')}</legend>
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

      <p className="text-fg-subtle text-xs">
        {t('newRoom.range', {
          sideMin: formatLength(LIMITS.roomSide.min, unit),
          sideMax: formatLength(LIMITS.roomSide.max, unit),
          heightMin: formatLength(LIMITS.roomHeight.min, unit),
          heightMax: formatLength(LIMITS.roomHeight.max, unit),
          unit,
        })}
      </p>

      <RoomPlan size={size} stale={!valid} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('newRoom.cancel')}
        </Button>
        <Button type="submit" disabled={!valid}>
          {t('newRoom.create')}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The longest side the plan always has room for, so small rooms look small next to big ones. */
const PLAN_REFERENCE_METRES = 6;
const PLAN_PIXELS = 160;

/** A plan view of the room, to scale, drawn as the size is typed. Faded while a value is wrong. */
function RoomPlan({ size, stale }: { size: RoomSize; stale: boolean }) {
  const scale = PLAN_PIXELS / Math.max(PLAN_REFERENCE_METRES, size.width, size.depth);
  const width = size.width * scale;
  const depth = size.depth * scale;
  const side = PLAN_PIXELS + 40;
  return (
    <svg
      role="img"
      aria-label={t('newRoom.preview', { width: size.width, depth: size.depth })}
      viewBox={`0 0 ${side} ${side}`}
      className={cn('mx-auto h-44 w-44 text-fg-muted transition-opacity', stale && 'opacity-40')}
    >
      <rect
        x={(side - width) / 2}
        y={(side - depth) / 2}
        width={width}
        height={depth}
        className="fill-muted stroke-primary"
        strokeWidth={3}
      />
      <text
        x={side / 2}
        y={(side - depth) / 2 - 6}
        textAnchor="middle"
        className="fill-current text-[11px]"
      >
        {size.width} m
      </text>
      <text
        x={(side - width) / 2 - 6}
        y={side / 2}
        textAnchor="middle"
        transform={`rotate(-90 ${(side - width) / 2 - 6} ${side / 2})`}
        className="fill-current text-[11px]"
      >
        {size.depth} m
      </text>
    </svg>
  );
}
