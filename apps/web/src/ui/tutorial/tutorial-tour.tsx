'use client';

import { XIcon } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '@/ui/components/button';
import { type MessageKey, translate } from '@/ui/i18n';
import { TUTORIAL_STEPS, type TutorialTarget } from './tutorial-steps';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

const CARD_WIDTH = 320;
const CARD_HEIGHT = 230;
const GAP = 12;
const EDGE = 16;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measure(target: TutorialTarget): Box | null {
  const element = document.querySelector(`[data-tour="${target}"]`);
  const rect = element?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  // A closed drawer is still laid out, just off screen.
  if (rect.right <= 0 || rect.left >= window.innerWidth) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Where the card goes: beside the target where there is room (right, left, above, below), else
 * over it; centred in the window when the target is not on screen (a closed drawer).
 */
export function placeCard(box: Box | null, view: { width: number; height: number }): CSSProperties {
  if (!box) {
    return {
      left: clamp((view.width - CARD_WIDTH) / 2, EDGE, view.width),
      top: clamp((view.height - CARD_HEIGHT) / 2, EDGE, view.height),
    };
  }
  const maxLeft = view.width - CARD_WIDTH - EDGE;
  const maxTop = view.height - CARD_HEIGHT - EDGE;
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  if (view.width - right >= CARD_WIDTH + GAP + EDGE) {
    return { left: right + GAP, top: clamp(box.top + GAP, EDGE, maxTop) };
  }
  if (box.left >= CARD_WIDTH + GAP + EDGE) {
    return { left: box.left - CARD_WIDTH - GAP, top: clamp(box.top + GAP, EDGE, maxTop) };
  }
  const alongX = clamp(right - CARD_WIDTH, EDGE, maxLeft);
  if (box.top >= CARD_HEIGHT + GAP + EDGE) {
    return { left: clamp(box.left + GAP, EDGE, maxLeft), bottom: view.height - box.top + GAP };
  }
  if (view.height - bottom >= CARD_HEIGHT + GAP + EDGE) return { left: alongX, top: bottom + GAP };
  return {
    left: clamp(box.left + (box.width - CARD_WIDTH) / 2, EDGE, maxLeft),
    top: clamp(box.top + (box.height - CARD_HEIGHT) / 2, EDGE, maxTop),
  };
}

/**
 * The first-run tour (P8-02). Not modal: the editor stays usable, so the person can try each step
 * as it is explained. The step heading takes the focus (and the progress is announced); Esc, Skip
 * or Done close it and hand the focus back to where it was. Movement only without reduced motion.
 */
export function TutorialTour({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState({ width: 1024, height: 768 });
  const heading = useRef<HTMLHeadingElement>(null);
  const step = TUTORIAL_STEPS[index] ?? (TUTORIAL_STEPS[0] as (typeof TUTORIAL_STEPS)[number]);
  const last = index === TUTORIAL_STEPS.length - 1;

  // Give the focus back to whatever had it when the tour opened.
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useLayoutEffect(() => {
    const update = () => {
      setBox(measure(step.target));
      setView({ width: window.innerWidth, height: window.innerHeight });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [step.target]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: every new step takes the focus.
  useEffect(() => {
    heading.current?.focus();
  }, [index]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // The editor's own Escape (clear the selection) is not what was meant here.
    event.stopPropagation();
    onClose();
  };

  return (
    <>
      {box ? (
        <div
          aria-hidden="true"
          data-testid="tutorial-highlight"
          className="pointer-events-none fixed z-40 rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background motion-safe:transition-all motion-safe:duration-200"
          style={box}
        />
      ) : null}
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        onKeyDown={onKeyDown}
        className="fixed z-50 flex flex-col gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg motion-safe:transition-[top,left,bottom] motion-safe:duration-200"
        style={{ width: CARD_WIDTH, ...placeCard(box, view) }}
      >
        <div className="flex items-start justify-between gap-2">
          <p aria-live="polite" className="text-fg-muted text-xs">
            {t('tutorial.progress', { step: index + 1, total: TUTORIAL_STEPS.length })}
          </p>
          <Button variant="ghost" size="icon-sm" aria-label={t('tutorial.close')} onClick={onClose}>
            <XIcon />
          </Button>
        </div>
        <h2
          ref={heading}
          id={`${id}-title`}
          tabIndex={-1}
          className="font-semibold text-base outline-none"
        >
          {t(step.title)}
        </h2>
        <p id={`${id}-body`} className="text-fg-muted text-sm">
          {t(step.body)}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('tutorial.skip')}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              {t('tutorial.back')}
            </Button>
            <Button size="sm" onClick={() => (last ? onClose() : setIndex(index + 1))}>
              {last ? t('tutorial.done') : t('tutorial.next')}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
