'use client';

import {
  type CatalogProvider,
  type CommandError,
  type CommandResult,
  duplicateObjects,
  type EditorSession,
  maxElevation,
  moveObjects,
  type ObjectId,
  removeObjects,
  rotateObjects,
  setObjectElevations,
  setObjectProps,
} from '@roomforge/core';
import { useId, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { Switch } from '@/ui/components/switch';
import { type MessageKey, translate } from '@/ui/i18n';
import { type Commit, type LiveValue, ScrubInput } from './scrub-input';
import { cmToMetres, degreesToRadians, formatNumber, metresToCm, radiansToDegrees } from './units';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

/**
 * The pose of the object being dragged in the scene, in room-local metres and radians. The panel
 * shows it live without re-rendering. The object `read` returns is reused: read it, do not keep it.
 */
export interface LiveTransform {
  read(): { id: string; x: number; y: number; z: number; rotationY: number } | null;
  subscribe(listener: () => void): () => void;
}

/** A refusal from the document as something a person can act on. */
function refusal(error: CommandError): string {
  return error.violations?.some((violation) => violation.invariant === 'I3')
    ? t('properties.outsideRoom')
    : t('properties.refused');
}

const outcome = (result: CommandResult): Commit =>
  result.ok ? { ok: true } : { ok: false, message: refusal(result.error) };

/**
 * Everything about one selected object: name, position, rotation, size, lock and visibility,
 * duplicate and delete. Numbers are in centimetres and degrees; each change is one command, and
 * the history coalesces a burst of them (typing, arrows, scrubbing) into one entry. While the
 * object is dragged in the scene the position and rotation fields follow it without re-rendering.
 */
export function ObjectProperties(props: {
  session: EditorSession;
  id: ObjectId;
  catalog?: CatalogProvider | undefined;
  live?: LiveTransform | undefined;
}) {
  const { session, id, catalog, live } = props;
  const object = useStore(session.store, (state) => state.document.objects[id]);
  const roomHeight = useStore(session.store, (state) => {
    const roomId = state.document.objects[id]?.roomId;
    return roomId ? (state.document.rooms[roomId]?.height ?? 0) : 0;
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const prefix = useId();

  const liveX = useMemo<LiveValue | undefined>(
    () => live && liveField(live, id, (p) => metresToCm(p.x)),
    [live, id],
  );
  const liveZ = useMemo<LiveValue | undefined>(
    () => live && liveField(live, id, (p) => metresToCm(p.z)),
    [live, id],
  );
  const liveY = useMemo<LiveValue | undefined>(
    () => live && liveField(live, id, (p) => metresToCm(p.y)),
    [live, id],
  );
  const liveRotation = useMemo<LiveValue | undefined>(
    () => live && liveField(live, id, (p) => radiansToDegrees(p.rotationY)),
    [live, id],
  );

  if (!object) return null;
  const [x, y, z] = object.transform.position;
  const [sx, sy, sz] = object.transform.scale ?? [1, 1, 1];
  const size = catalog?.getItem(object.catalogId)?.size;
  // Down to the millimetre, so the top of the range is never a hair above the ceiling.
  const elevationMax = Math.floor(metresToCm(maxElevation(roomHeight, size?.h ?? 0, sy)) * 10) / 10;
  // Objects standing on another take their height from it (P3-13).
  const onParent = object.parentId !== null;

  /** The position as it is now, so a field never commits a stale value for the other axis. */
  const current = () => session.getState().document.objects[id]?.transform.position ?? [x, y, z];
  const moveTo = (axis: 'x' | 'z', cm: number): Commit => {
    const [cx, cy, cz] = current();
    const metres = cmToMetres(cm);
    return outcome(
      session.execute(
        moveObjects([{ id, position: axis === 'x' ? [metres, cy, cz] : [cx, cy, metres] }]),
      ),
    );
  };

  const act = (command: ReturnType<typeof removeObjects>) => {
    const result = session.execute(command);
    setActionError(result.ok ? null : refusal(result.error));
    return result;
  };

  return (
    <section aria-labelledby={`${prefix}-title`} className="flex flex-col gap-4 p-4">
      <h2 id={`${prefix}-title`} className="truncate font-medium text-fg">
        {object.name ?? t('properties.unnamed')}
      </h2>

      <NameField session={session} id={id} name={object.name} />

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-fg-muted">{t('properties.catalogItem')}</dt>
        <dd className="truncate font-mono text-xs leading-5">{object.catalogId}</dd>
        {size && (
          <>
            <dt className="text-fg-muted">{t('properties.dimensions')}</dt>
            <dd className="text-xs leading-5">
              {t('properties.sizeValue', {
                width: formatNumber(metresToCm(size.w * sx)),
                depth: formatNumber(metresToCm(size.d * sz)),
                height: formatNumber(metresToCm(size.h * sy)),
              })}
            </dd>
          </>
        )}
      </dl>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium text-fg-muted text-xs uppercase tracking-wide">
          {t('properties.position')}
        </legend>
        <ScrubInput
          id={`${prefix}-x`}
          label={t('properties.x')}
          unit="cm"
          value={metresToCm(x)}
          step={1}
          onCommit={(value) => moveTo('x', value)}
          {...(liveX ? { live: liveX } : {})}
        />
        <ScrubInput
          id={`${prefix}-z`}
          label={t('properties.z')}
          unit="cm"
          value={metresToCm(z)}
          step={1}
          onCommit={(value) => moveTo('z', value)}
          {...(liveZ ? { live: liveZ } : {})}
        />
        <ScrubInput
          id={`${prefix}-y`}
          label={t('properties.elevation')}
          unit="cm"
          value={metresToCm(y)}
          step={1}
          readOnly={onParent}
          {...(onParent ? {} : { min: 0, max: elevationMax })}
          onCommit={(cm) =>
            outcome(session.execute(setObjectElevations([{ id, elevation: cmToMetres(cm) }])))
          }
          {...(liveY ? { live: liveY } : {})}
        />
        <ScrubInput
          id={`${prefix}-rotation`}
          label={t('properties.rotation')}
          unit="°"
          value={radiansToDegrees(object.transform.rotationY)}
          step={1}
          onCommit={(degrees) =>
            outcome(session.execute(rotateObjects([{ id, rotationY: degreesToRadians(degrees) }])))
          }
          {...(liveRotation ? { live: liveRotation } : {})}
        />
      </fieldset>

      <div className="flex flex-col gap-2">
        <SwitchRow
          id={`${prefix}-locked`}
          label={t('properties.locked')}
          checked={object.locked}
          onChange={(locked) => {
            act(setObjectProps([id], { locked }));
          }}
        />
        <SwitchRow
          id={`${prefix}-visible`}
          label={t('properties.visible')}
          checked={!object.hidden}
          onChange={(visible) => {
            act(setObjectProps([id], { hidden: !visible }));
          }}
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const before = session.getState().document.objectOrder.length;
            const result = act(duplicateObjects([id]));
            if (!result.ok) return;
            // The copy is the first object added: select it, as people expect after duplicating.
            const copy = session.getState().document.objectOrder[before];
            if (copy) session.select([copy as ObjectId], 'replace');
          }}
        >
          {t('properties.duplicate')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            act(removeObjects([id]));
          }}
        >
          {t('properties.delete')}
        </Button>
      </div>
      {actionError && (
        <p role="alert" className="text-destructive text-xs">
          {actionError}
        </p>
      )}
    </section>
  );
}

/** A field's view of the dragged pose: its value if the dragged object is this one, else null. */
function liveField(
  live: LiveTransform,
  id: ObjectId,
  pick: (pose: { x: number; y: number; z: number; rotationY: number }) => number,
): LiveValue {
  return {
    read() {
      const pose = live.read();
      return pose && pose.id === id ? pick(pose) : null;
    },
    subscribe: (listener) => live.subscribe(listener),
  };
}

function SwitchRow(props: {
  id: string;
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={props.id} className="text-sm">
        {props.label}
      </label>
      <Switch id={props.id} checked={props.checked} onCheckedChange={props.onChange} />
    </div>
  );
}

/** The name: Enter or leaving the field saves it, Esc goes back; an empty name clears it. */
function NameField(props: { session: EditorSession; id: ObjectId; name: string | undefined }) {
  const { session, id, name } = props;
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    if (trimmed === (name ?? '')) {
      setDraft(null);
      setError(null);
      return;
    }
    const result = session.execute(setObjectProps([id], { name: trimmed === '' ? null : trimmed }));
    if (result.ok) {
      setDraft(null);
      setError(null);
    } else {
      setError(t('properties.nameTooLong'));
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
        <label htmlFor={inputId} className="text-fg-muted text-sm">
          {t('properties.name')}
        </label>
        <Input
          id={inputId}
          type="text"
          value={draft ?? name ?? ''}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
            else if (event.key === 'Escape') {
              setDraft(null);
              setError(null);
            }
          }}
          onBlur={save}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
