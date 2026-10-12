'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type MessageKey, translate } from '@/ui/i18n';
import { cn } from '@/ui/lib/utils';
import type { CatalogPanelItem, CatalogPlacement } from './catalog-types';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

/** A press that moved less than this (px) before release is a click, not a drag. */
const DRAG_SLOP_PX = 4;
/** The cards are laid out two per row; the arrow keys move by this much up and down. */
const COLUMNS = 2;
/** The thumbnails are 256 px squares (P4-03), shown at half size for sharp HiDPI screens. */
const THUMBNAIL_PX = 128;

interface Press {
  item: CatalogPanelItem;
  x: number;
  y: number;
  dragging: boolean;
}

export interface CatalogGridProps {
  items: readonly CatalogPanelItem[];
  placement: CatalogPlacement;
  onPlace(id: string): boolean;
  /** The list's accessible name. */
  label: string;
  /** What the card says below the name: the footprint, or the opening of a door. */
  describe(item: CatalogPanelItem): string;
}

/** Where an arrow key, Home or End moves the focus from `index`; null for any other key. */
function nextIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return Math.min(index + 1, count - 1);
    case 'ArrowLeft':
      return Math.max(index - 1, 0);
    case 'ArrowDown':
      return index + COLUMNS < count ? index + COLUMNS : index;
    case 'ArrowUp':
      return index - COLUMNS >= 0 ? index - COLUMNS : index;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * The cards of the catalog (P4-06), two per row. Dragging a card into the viewport places the
 * item where it is dropped (P3-06); clicking it, or pressing Enter on it, places it in the middle
 * of the view. The grid is a single tab stop and the arrow keys move between the cards (roving
 * focus). The outcome of each placement is announced to assistive technology.
 */
export function CatalogGrid({ items, placement, onPlace, label, describe }: CatalogGridProps) {
  const [announcement, setAnnouncement] = useState('');
  const [active, setActive] = useState(0);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  // The drag lives in refs: pointer moves must not re-render the panel.
  const press = useRef<Press | null>(null);
  const suppressClick = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  const latest = useRef({ placement });
  latest.current = { placement };

  const announce = useCallback((item: CatalogPanelItem, placed: boolean) => {
    setAnnouncement(t(placed ? 'catalog.placed' : 'catalog.notPlaced', { name: item.name }));
  }, []);

  // A drag in progress ends with the panel.
  useEffect(
    () => () => {
      if (press.current?.dragging) latest.current.placement.cancel();
      stop.current?.();
    },
    [],
  );

  const onPointerDown = (event: React.PointerEvent, item: CatalogPanelItem) => {
    if (event.button !== 0) return;
    press.current = { item, x: event.clientX, y: event.clientY, dragging: false };

    const finish = () => {
      press.current = null;
      stop.current?.();
      stop.current = null;
    };
    const onMove = (move: PointerEvent) => {
      const current = press.current;
      if (!current) return;
      if (!current.dragging) {
        const dx = move.clientX - current.x;
        const dy = move.clientY - current.y;
        if (dx * dx + dy * dy <= DRAG_SLOP_PX * DRAG_SLOP_PX) return;
        suppressClick.current = true;
        if (!latest.current.placement.begin(current.item.id)) {
          finish(); // refused: neither a click nor a drag
          return;
        }
        current.dragging = true;
      }
      latest.current.placement.move(move.clientX, move.clientY, move.altKey);
    };
    const onUp = (up: PointerEvent) => {
      const current = press.current;
      finish();
      if (current?.dragging) {
        announce(current.item, latest.current.placement.end(up.clientX, up.clientY));
      }
    };
    const onCancel = () => {
      if (press.current?.dragging) latest.current.placement.cancel();
      finish();
    };
    const onKey = (key: KeyboardEvent) => {
      if (key.key === 'Escape' && press.current) onCancel();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    stop.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  };

  const onClick = (item: CatalogPanelItem) => {
    if (suppressClick.current) {
      suppressClick.current = false; // the click that ends a drag is not a placement
      return;
    }
    announce(item, onPlace(item.id));
  };

  // A filter can leave the remembered card past the end of the list.
  const current = Math.min(active, items.length - 1);
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next = nextIndex(event.key, index, items.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    cards.current[next]?.focus();
  };

  return (
    <>
      <ul
        aria-label={label}
        className="grid min-h-0 grid-cols-2 content-start gap-1.5 overflow-y-auto"
      >
        {items.map((item, index) => (
          <li key={item.id} className="min-w-0">
            <button
              ref={(element) => {
                cards.current[index] = element;
              }}
              type="button"
              tabIndex={index === current ? 0 : -1}
              onFocus={() => setActive(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              onPointerDown={(event) => onPointerDown(event, item)}
              onClick={() => onClick(item)}
              style={{ touchAction: 'pan-y' }}
              className={cn(
                'flex w-full select-none flex-col gap-1 rounded-md border border-subtle bg-surface p-1.5 text-left',
                'outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <Thumbnail item={item} />
              <span className="flex min-w-0 flex-col px-0.5">
                <span className="line-clamp-2 font-medium text-fg text-xs">{item.name}</span>
                <span className="text-fg-muted text-xs">{describe(item)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

/**
 * The picture of the item, in a square reserved before it loads (no layout shift). Items without
 * one (the stub boxes, doors and windows), or whose picture fails, show a swatch of their colour.
 * The picture is decorative: the card's name says what it is, so `alt` is empty.
 */
function Thumbnail({ item }: { item: CatalogPanelItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm bg-canvas">
      {item.thumbnail && !failed ? (
        // biome-ignore lint/performance/noImgElement: a static export has no next/image optimizer; the WebP is already sized and hashed (P4-03).
        <img
          src={item.thumbnail}
          alt=""
          width={THUMBNAIL_PX}
          height={THUMBNAIL_PX}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="size-full object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="size-1/2 rounded-sm border border-subtle"
          style={{ backgroundColor: item.color }}
        />
      )}
    </span>
  );
}
