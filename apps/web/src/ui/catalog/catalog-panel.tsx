'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/ui/components/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs';
import { type MessageKey, translate } from '@/ui/i18n';
import { cn } from '@/ui/lib/utils';
import { PanelHint } from '@/ui/shell/side-panel';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

/** A press that moved less than this (px) before release is a click, not a drag. */
const DRAG_SLOP_PX = 4;

/** What the panel shows about an item (the host maps its manifest entries to this). */
export interface CatalogPanelItem {
  id: string;
  /** Already in the language of the panel. */
  name: string;
  /** Colour of the box that stands in for the model. */
  color: string;
  /** Bounding box in metres; the panel shows the footprint in centimetres. */
  size: { w: number; h: number; d: number };
}

/**
 * Dragging an item into the viewport, in page coordinates. The scene owns the 3D ghost; the panel
 * only forwards the pointer (pointer events, not native drag and drop, so the ghost can be 3D
 * and touch works).
 */
export interface CatalogPlacement {
  /** The item left the panel; false when the scene cannot take it (no room). */
  begin(id: string): boolean;
  move(clientX: number, clientY: number, free: boolean): void;
  /** Released: true when an object was created. */
  end(clientX: number, clientY: number): boolean;
  cancel(): void;
}

export interface CatalogPanelProps {
  items: readonly CatalogPanelItem[];
  placement: CatalogPlacement;
  /** Click or Enter: place the item in the middle of the view; true when it was placed. */
  onPlace(id: string): boolean;
  /**
   * Doors and windows (P3-12), shown in a Structure tab next to the objects: dragged onto a wall,
   * or put on the wall in front of the view. Their `size.h` is the height of the opening.
   */
  structure?: {
    items: readonly CatalogPanelItem[];
    placement: CatalogPlacement;
    onPlace(id: string): boolean;
  };
}

/**
 * The catalog panel: the objects, and when `structure` is given a Structure tab with the doors
 * and windows. The real catalog panel with categories and thumbnails replaces this in P4-06.
 */
export function CatalogPanel({ items, placement, onPlace, structure }: CatalogPanelProps) {
  const objects = <CatalogList items={items} placement={placement} onPlace={onPlace} />;
  if (!structure) return objects;
  return (
    <Tabs defaultValue="objects" className="min-h-0 flex-1 gap-0">
      <div className="flex h-10 shrink-0 items-center px-2">
        <TabsList variant="line">
          <TabsTrigger value="objects">{t('catalog.tabObjects')}</TabsTrigger>
          <TabsTrigger value="structure">{t('catalog.tabStructure')}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="objects" className="flex min-h-0 flex-col">
        {objects}
      </TabsContent>
      <TabsContent value="structure" className="flex min-h-0 flex-col">
        <CatalogList {...structure} structure />
      </TabsContent>
    </Tabs>
  );
}

interface Press {
  item: CatalogPanelItem;
  x: number;
  y: number;
  dragging: boolean;
}

/**
 * A list of items (P3-06): a search box (objects only) and the items. Dragging an item into the
 * viewport places it where it is dropped; clicking it, or pressing Enter on it, places it in the
 * middle of the view. The outcome is announced to assistive technology.
 */
function CatalogList({
  items,
  placement,
  onPlace,
  structure = false,
}: Omit<CatalogPanelProps, 'structure'> & { structure?: boolean }) {
  const [query, setQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');
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

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? items.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(needle))
    : items;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      {structure ? null : (
        <Input
          type="search"
          aria-label={t('catalog.search')}
          placeholder={t('catalog.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <p className="px-1 text-fg-subtle text-xs">
        {t(structure ? 'catalog.structureHint' : 'catalog.hint')}
      </p>
      {shown.length === 0 ? (
        <PanelHint>{t('catalog.empty', { query: query.trim() })}</PanelHint>
      ) : (
        <ul
          aria-label={t(structure ? 'catalog.structureList' : 'catalog.list')}
          className="flex min-h-0 flex-col gap-1 overflow-y-auto"
        >
          {shown.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onPointerDown={(event) => onPointerDown(event, item)}
                onClick={() => onClick(item)}
                style={{ touchAction: 'pan-y' }}
                className={cn(
                  'flex w-full select-none items-center gap-3 rounded-md border border-subtle bg-surface px-2 py-2 text-left',
                  'outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-8 shrink-0 rounded-sm border border-subtle"
                  style={{ backgroundColor: item.color }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-fg">{item.name}</span>
                  <span className="text-fg-muted text-xs">
                    {structure
                      ? t('catalog.openingDimensions', {
                          width: Math.round(item.size.w * 100),
                          height: Math.round(item.size.h * 100),
                        })
                      : t('catalog.dimensions', {
                          width: Math.round(item.size.w * 100),
                          depth: Math.round(item.size.d * 100),
                        })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
