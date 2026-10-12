import { CATALOG_CATEGORIES, type CatalogCategory } from '@roomforge/core';
import { type CatalogEntry, catalogEntries } from '@/asset-library';
import {
  type CatalogCategoryOption,
  type CatalogPanelItem,
  type MessageKey,
  translate,
} from '@/ui';

const categoryLabel = (category: CatalogCategory) =>
  translate('en', `catalog.category.${category}` as MessageKey);

/**
 * What the catalog panel shows of an entry: its name in the panel's language, and the other
 * language's name, its tags and its category as words the search finds it by.
 */
export function toPanelItem(entry: CatalogEntry): CatalogPanelItem {
  return {
    id: entry.id,
    name: entry.name.en,
    color: entry.color,
    size: entry.size,
    keywords: [
      entry.name.es,
      ...(entry.tags ?? []),
      ...(entry.category ? [categoryLabel(entry.category)] : []),
    ],
    ...(entry.category ? { category: entry.category } : {}),
    ...(entry.thumbnail ? { thumbnail: entry.thumbnail } : {}),
  };
}

/** The categories the entries use, in the manifest schema's order: empty ones are not offered. */
export function categoriesOf(entries: readonly CatalogEntry[]): CatalogCategoryOption[] {
  const used = new Set(entries.map((entry) => entry.category));
  return CATALOG_CATEGORIES.filter((category) => used.has(category)).map((category) => ({
    id: category,
    label: categoryLabel(category),
  }));
}

/** What the catalog panel lists: the manifest's models, then the stub boxes. */
export const CATALOG_ITEMS: readonly CatalogPanelItem[] = catalogEntries().map(toPanelItem);
export const CATALOG_CATEGORY_OPTIONS: readonly CatalogCategoryOption[] = categoriesOf(
  catalogEntries(),
);
