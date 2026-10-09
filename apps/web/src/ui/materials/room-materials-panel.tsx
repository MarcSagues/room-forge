'use client';

import {
  type EditorSession,
  type HexColor,
  MATERIAL_CATEGORIES,
  MATERIAL_PRESETS,
  type MaterialRef,
  type RoomId,
  type RoomSurface,
  resolveMaterial,
  setSurfacesMaterial,
  type WallId,
} from '@roomforge/core';
import { type KeyboardEvent, useId, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { Slider } from '@/ui/components/slider';
import { translate } from '@/ui/i18n';
import { cn } from '@/ui/lib/utils';
import { PanelHint } from '@/ui/shell/side-panel';
import { parseHexColor } from './hex';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

type Target = 'floor' | 'ceiling' | 'walls' | WallId;

const TARGETS: readonly Target[] = ['floor', 'ceiling', 'walls', 'north', 'east', 'south', 'west'];
const WALLS: readonly WallId[] = ['north', 'east', 'south', 'west'];

const surfacesOf = (target: Target): readonly RoomSurface[] =>
  target === 'walls' ? WALLS : [target];

/** The surface whose material the controls show; "all walls" shows the first wall's. */
const representative = (target: Target): RoomSurface => (target === 'walls' ? 'north' : target);

const NO_TINT_COLOUR = '#ffffff';

/** A quick palette of tints: white leaves the preset's own colour as it is. */
const QUICK_TINTS: readonly HexColor[] = [
  '#ffffff',
  '#f2d4c2',
  '#e8a598',
  '#e6c15a',
  '#9cc79a',
  '#7fb8c9',
  '#7d93d6',
  '#b196d9',
  '#8a8f98',
  '#3b3f46',
];

/**
 * Materials of the room's surfaces: floor, ceiling, each wall or all the walls at once. Choosing a
 * preset, a tint or a finish is one command, and dragging a colour or a slider coalesces into a
 * single undo step (the command's merge key). Only the shown surface's material is subscribed, so
 * nothing else in the document re-renders it.
 */
export function RoomMaterialsPanel({ session }: { session: EditorSession }) {
  const titleId = useId();
  const [target, setTarget] = useState<Target>('floor');
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const picked = useStore(
    session.store,
    useShallow((state) => {
      const id = state.document.roomOrder[0] as RoomId | undefined;
      const room = id ? state.document.rooms[id] : undefined;
      const surface = representative(target);
      const material = !room
        ? undefined
        : surface === 'floor'
          ? room.floor.material
          : surface === 'ceiling'
            ? room.ceiling.material
            : room.walls[surface].material;
      // Primitives only: `useShallow` compares one level, so a nested object would never be equal.
      return {
        roomId: id,
        presetId: material?.presetId,
        tint: material?.tint,
        roughness: material?.roughness,
        metalness: material?.metalness,
      };
    }),
  );
  const { roomId, ...current } = picked;

  if (!roomId || current.presetId === undefined) {
    return <PanelHint>{t('materials.noRoom')}</PanelHint>;
  }
  const presetId = current.presetId;

  const look = resolveMaterial({
    presetId,
    ...(current.tint !== undefined ? { tint: current.tint } : {}),
    ...(current.roughness !== undefined ? { roughness: current.roughness } : {}),
    ...(current.metalness !== undefined ? { metalness: current.metalness } : {}),
  });

  const apply = (next: MaterialRef) => {
    session.execute(setSurfacesMaterial(roomId, surfacesOf(target), next));
  };
  const withOverrides = (overrides: Partial<MaterialRef>): MaterialRef => ({
    presetId,
    ...(current.tint !== undefined ? { tint: current.tint } : {}),
    ...(current.roughness !== undefined ? { roughness: current.roughness } : {}),
    ...(current.metalness !== undefined ? { metalness: current.metalness } : {}),
    ...overrides,
  });
  const setTint = (tint: HexColor) => {
    setDraft(null);
    setInvalid(false);
    apply(withOverrides({ tint }));
  };
  const clearTint = () => {
    setDraft(null);
    setInvalid(false);
    const { tint: _removed, ...rest } = withOverrides({});
    apply(rest);
  };
  const commitDraft = () => {
    if (draft === null) return;
    if (draft.trim() === '') return clearTint();
    const parsed = parseHexColor(draft);
    if (parsed) return setTint(parsed);
    setInvalid(true);
  };
  const onDraftKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commitDraft();
    if (event.key === 'Escape') {
      setDraft(null);
      setInvalid(false);
    }
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 p-4">
      <h2 id={titleId} className="font-medium text-fg">
        {t('materials.title')}
      </h2>

      <fieldset className="flex flex-wrap gap-1">
        <legend className="sr-only">{t('materials.surface')}</legend>
        {TARGETS.map((entry) => (
          <Button
            key={entry}
            type="button"
            size="sm"
            variant={entry === target ? 'secondary' : 'outline'}
            aria-pressed={entry === target}
            onClick={() => {
              setTarget(entry);
              setDraft(null);
              setInvalid(false);
            }}
          >
            {t(`materials.surface.${entry}`)}
          </Button>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{t('materials.presets')}</legend>
        {MATERIAL_CATEGORIES.map((category) => (
          <div key={category} className="flex flex-col gap-1.5">
            <h3 className="text-fg-muted text-xs uppercase tracking-wide">
              {t(`materials.category.${category}`)}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {MATERIAL_PRESETS.filter((preset) => preset.category === category).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-label={preset.name.en}
                  title={preset.name.en}
                  aria-pressed={current.presetId === preset.id}
                  onClick={() => apply({ presetId: preset.id })}
                  style={{ backgroundColor: preset.color }}
                  className={cn(
                    'size-7 rounded-md border border-border outline-none transition-shadow',
                    'focus-visible:ring-3 focus-visible:ring-ring/50',
                    current.presetId === preset.id && 'ring-2 ring-primary ring-offset-1',
                  )}
                />
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <span className="text-fg-muted text-xs uppercase tracking-wide">{t('materials.tint')}</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={t('materials.tintPicker')}
            value={current.tint ?? NO_TINT_COLOUR}
            onChange={(event) => setTint(event.target.value as HexColor)}
            className="size-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          />
          <Input
            aria-label={t('materials.tintHex')}
            aria-invalid={invalid}
            spellCheck={false}
            autoComplete="off"
            maxLength={9}
            placeholder="#aabbcc"
            className="font-mono"
            value={draft ?? current.tint ?? ''}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
            onBlur={commitDraft}
            onKeyDown={onDraftKey}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={current.tint === undefined}
            onClick={clearTint}
          >
            {t('materials.tintClear')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TINTS.map((colour) => (
            <button
              key={colour}
              type="button"
              aria-label={translate('en', 'materials.quickTint', { color: colour })}
              title={colour}
              aria-pressed={current.tint === colour}
              onClick={() => setTint(colour)}
              style={{ backgroundColor: colour }}
              className={cn(
                'size-5 rounded-full border border-border outline-none transition-shadow',
                'focus-visible:ring-3 focus-visible:ring-ring/50',
                current.tint === colour && 'ring-2 ring-primary ring-offset-1',
              )}
            />
          ))}
        </div>
        {invalid ? (
          <p role="alert" className="text-destructive text-xs">
            {t('materials.tintInvalid')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-fg-muted text-xs uppercase tracking-wide">
          {t('materials.finish')}
        </span>
        <FinishSlider
          label={t('materials.roughness')}
          value={look.roughness}
          onChange={(roughness) => apply(withOverrides({ roughness }))}
        />
        <FinishSlider
          label={t('materials.metalness')}
          value={look.metalness}
          onChange={(metalness) => apply(withOverrides({ metalness }))}
        />
      </div>
    </section>
  );
}

function FinishSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span id={id}>{label}</span>
        <span className="font-mono text-fg-muted text-xs">{value.toFixed(2)}</span>
      </div>
      <Slider
        aria-labelledby={id}
        min={0}
        max={1}
        step={0.01}
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
      />
    </div>
  );
}
