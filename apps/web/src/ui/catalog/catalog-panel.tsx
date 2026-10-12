'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs';
import { type MessageKey, translate } from '@/ui/i18n';
import { PanelHint } from '@/ui/shell/side-panel';
import { CatalogGrid } from './catalog-grid';
import {
  type CatalogPrefs,
  type CatalogPrefsStorage,
  defaultCatalogStorage,
  loadCatalogPrefs,
  NO_PREFS,
  recordPlaced,
  saveCatalogPrefs,
  toggleFavorite,
} from './catalog-prefs';
import { foldText, matchesWords, queryWords } from './catalog-search';
import type { CatalogCategoryOption, CatalogPanelItem, CatalogPlacement } from './catalog-types';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

const cm = (metres: number) => Math.round(metres * 100);
const footprint = (item: CatalogPanelItem) =>
  t('catalog.dimensions', { width: cm(item.size.w), depth: cm(item.size.d) });
const opening = (item: CatalogPanelItem) =>
  t('catalog.openingDimensions', { width: cm(item.size.w), height: cm(item.size.h) });

/** The two filters that are not manifest categories (ids a manifest category cannot have). */
const FAVORITES = '@favorites';
const RECENT = '@recent';

export interface CatalogPanelProps {
  items: readonly CatalogPanelItem[];
  /** The category filter, derived by the host from its manifest; none hides the filter. */
  categories?: readonly CatalogCategoryOption[];
  placement: CatalogPlacement;
  /** Click or Enter: place the item in the middle of the view; true when it was placed. */
  onPlace(id: string): boolean;
  /** Where the favourites and recent items persist; `localStorage` by default. */
  prefsStorage?: CatalogPrefsStorage;
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
 * The catalog panel (P4-06): the objects, with a search box and a category filter, and when
 * `structure` is given a Structure tab with the doors and windows.
 */
export function CatalogPanel({ structure, ...objectsProps }: CatalogPanelProps) {
  const objects = <ObjectsView {...objectsProps} />;
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
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <p className="px-1 text-fg-subtle text-xs">{t('catalog.structureHint')}</p>
          <CatalogGrid {...structure} label={t('catalog.structureList')} describe={opening} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

/**
 * The objects: a search box that ignores case and accents and also looks at each item's keywords
 * (its name in the other language, its tags), a category filter, and the cards.
 */
function ObjectsView({
  items,
  categories = [],
  placement,
  onPlace,
  prefsStorage,
}: Omit<CatalogPanelProps, 'structure'>) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const { prefs, update } = useCatalogPrefs(prefsStorage);
  const searchable = useMemo(
    () =>
      items.map((item) => ({
        item,
        text: foldText([item.name, item.id, ...(item.keywords ?? [])].join(' ')),
      })),
    [items],
  );

  const favorites = useMemo(() => new Set(prefs.favorites), [prefs.favorites]);
  const scoped =
    category === RECENT
      ? prefs.recent.flatMap((id) => searchable.find((entry) => entry.item.id === id) ?? [])
      : searchable.filter(
          ({ item }) =>
            category === null ||
            (category === FAVORITES ? favorites.has(item.id) : item.category === category),
        );
  const words = queryWords(query);
  const shown = scoped.filter(({ text }) => matchesWords(text, words)).map(({ item }) => item);
  const options = [
    { id: null, label: t('catalog.allCategories') },
    { id: FAVORITES, label: t('catalog.favorites') },
    { id: RECENT, label: t('catalog.recent') },
    ...categories,
  ];
  const categoryLabel = category && options.find((option) => option.id === category)?.label;
  const emptyMessage =
    words.length === 0 && category === FAVORITES
      ? t('catalog.noFavorites')
      : words.length === 0 && category === RECENT
        ? t('catalog.noRecent')
        : categoryLabel
          ? t('catalog.emptyInCategory', { category: categoryLabel, query: query.trim() })
          : t('catalog.empty', { query: query.trim() });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <Input
        type="search"
        aria-label={t('catalog.search')}
        placeholder={t('catalog.searchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <fieldset className="flex flex-wrap gap-1">
        <legend className="sr-only">{t('catalog.categories')}</legend>
        {options.map((option) => (
          <Button
            key={option.id ?? 'all'}
            type="button"
            size="xs"
            variant={option.id === category ? 'secondary' : 'outline'}
            aria-pressed={option.id === category}
            onClick={() => setCategory(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </fieldset>
      <p className="px-1 text-fg-subtle text-xs">{t('catalog.hint')}</p>
      {shown.length > 0 ? (
        <CatalogGrid
          items={shown}
          placement={placement}
          onPlace={onPlace}
          label={t('catalog.list')}
          describe={footprint}
          favorites={favorites}
          onToggleFavorite={(id) => update((current) => toggleFavorite(current, id))}
          onPlaced={(id) => update((current) => recordPlaced(current, id))}
        />
      ) : items.length === 0 ? (
        <PanelHint>{t('catalog.none')}</PanelHint>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <PanelHint>{emptyMessage}</PanelHint>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mx-1"
            onClick={() => {
              setQuery('');
              setCategory(null);
            }}
          >
            {t('catalog.showAll')}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The favourites and recent items, read once the panel is in the browser (never during a server
 * render) and written on every change. Kept in a ref too: a drop ends in a pointer listener that
 * was set up before the last change.
 */
function useCatalogPrefs(storage: CatalogPrefsStorage | undefined) {
  const [prefs, setPrefs] = useState<CatalogPrefs>(NO_PREFS);
  const latest = useRef(prefs);
  useEffect(() => {
    const loaded = loadCatalogPrefs(storage ?? defaultCatalogStorage());
    latest.current = loaded;
    setPrefs(loaded);
  }, [storage]);
  const update = useCallback(
    (change: (current: CatalogPrefs) => CatalogPrefs) => {
      const next = change(latest.current);
      latest.current = next;
      setPrefs(next);
      saveCatalogPrefs(storage ?? defaultCatalogStorage(), next);
    },
    [storage],
  );
  return { prefs, update };
}
