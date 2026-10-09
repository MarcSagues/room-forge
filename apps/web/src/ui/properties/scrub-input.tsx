'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { translate } from '@/ui/i18n';
import { cn } from '@/ui/lib/utils';
import { formatNumber, parseNumber } from './units';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

/** How a commit went: the panel turns the document's refusal into a message to show. */
export type Commit = { ok: true } | { ok: false; message: string };

/**
 * A value that changes while something else is dragged (the object in the scene): the field shows
 * it straight in the DOM, with no React render, and goes back to the real value on `null`.
 */
export interface LiveValue {
  /** The live value in the unit of the field, or null when nothing is being dragged. */
  read(): number | null;
  subscribe(listener: () => void): () => void;
}

/** Sideways pixels the pointer must travel to change the value by one step. */
export const SCRUB_PX_PER_STEP = 4;
/** `Shift` makes every step this many times bigger (arrow keys and scrubbing). */
export const COARSE_FACTOR = 10;

export interface ScrubInputProps {
  id: string;
  label: string;
  unit: string;
  /** The real value, in the unit shown. */
  value: number;
  /** Change per arrow key press, and per few pixels of scrubbing. */
  step: number;
  /** Called with each new value; the answer decides whether the field shows an error. */
  onCommit(value: number): Commit;
  readOnly?: boolean;
  live?: LiveValue;
}

/**
 * A numeric field with its unit (DESIGN_SYSTEM §5.2). Type and press Enter (or leave the field) to
 * commit, `Esc` to go back; ArrowUp/ArrowDown change it by a step (`Shift` ×10); dragging the label
 * sideways scrubs it, like Figma. Every change is committed as it happens: the history coalesces
 * the burst into one entry. A refused value keeps what was typed, flagged with `aria-invalid` and a
 * message.
 */
export function ScrubInput(props: ScrubInputProps) {
  const { id, label, unit, value, step, onCommit, readOnly, live } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  // What is being typed, or null while the field just shows the value.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ value, step, onCommit });
  latest.current = { value, step, onCommit };
  const scrub = useRef<{ startX: number; startValue: number; last: number } | null>(null);
  const stopScrub = useRef<(() => void) | null>(null);

  const commit = (next: number): boolean => {
    const result = latest.current.onCommit(next);
    setError(result.ok ? null : result.message);
    if (result.ok) setDraft(null);
    return result.ok;
  };

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = parseNumber(draft);
    if (parsed === null) {
      setError(t('properties.notANumber'));
      return;
    }
    if (parsed === latest.current.value) {
      setDraft(null);
      setError(null);
      return;
    }
    commit(parsed);
  };

  const revert = () => {
    setDraft(null);
    setError(null);
  };

  // Follow a drag happening elsewhere, unless the person is typing here.
  useEffect(() => {
    if (!live) return;
    return live.subscribe(() => {
      const input = inputRef.current;
      if (!input || document.activeElement === input) return;
      const current = live.read();
      input.value = formatNumber(current ?? latest.current.value);
    });
  }, [live]);

  useEffect(() => () => stopScrub.current?.(), []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Escape') {
      revert();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const parsed = draft === null ? latest.current.value : parseNumber(draft);
      if (parsed === null) return;
      const amount = latest.current.step * (event.shiftKey ? COARSE_FACTOR : 1);
      commit(parsed + (event.key === 'ArrowUp' ? amount : -amount));
    }
  };

  const onLabelPointerDown = (event: React.PointerEvent<HTMLLabelElement>) => {
    if (readOnly || event.button !== 0) return;
    event.preventDefault(); // no text selection, and the field keeps its focus state
    scrub.current = {
      startX: event.clientX,
      startValue: latest.current.value,
      last: latest.current.value,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== 'Escape' || !scrub.current) return;
      const { startValue } = scrub.current;
      scrub.current = null;
      stopScrub.current?.();
      commit(startValue);
    };
    window.addEventListener('keydown', onKey);
    stopScrub.current = () => {
      window.removeEventListener('keydown', onKey);
      stopScrub.current = null;
    };
  };

  const onLabelPointerMove = (event: React.PointerEvent<HTMLLabelElement>) => {
    const gesture = scrub.current;
    if (!gesture) return;
    const steps = Math.trunc((event.clientX - gesture.startX) / SCRUB_PX_PER_STEP);
    const factor = event.shiftKey ? COARSE_FACTOR : 1;
    const next = gesture.startValue + steps * latest.current.step * factor;
    if (next === gesture.last) return;
    gesture.last = next;
    commit(next);
  };

  const endScrub = () => {
    scrub.current = null;
    stopScrub.current?.();
  };

  const shown = draft ?? formatNumber(value);
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2">
        <label
          htmlFor={id}
          onPointerDown={onLabelPointerDown}
          onPointerMove={onLabelPointerMove}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          style={{ touchAction: 'none' }}
          className={cn(
            'select-none truncate text-fg-muted text-sm',
            !readOnly && 'cursor-ew-resize',
          )}
        >
          {label}
        </label>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          role="spinbutton"
          autoComplete="off"
          spellCheck={false}
          readOnly={readOnly}
          aria-valuenow={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={shown}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!readOnly) commitDraft();
          }}
          className={cn(
            'h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-right text-sm tabular-nums outline-none',
            'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:border-destructive',
            'read-only:text-fg-muted',
          )}
        />
        <span className="w-6 text-fg-subtle text-xs">{unit}</span>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
