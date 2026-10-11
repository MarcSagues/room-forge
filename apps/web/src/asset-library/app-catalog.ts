import type { CatalogId } from '@roomforge/core';
import { modelCatalog } from './manifest-catalog';
import { type CatalogEntry, type ColoredCatalog, stubCatalog, stubEntries } from './stub-catalog';

/** The catalog the editor uses: the core port, placeholder colours and where each model is. */
export interface AppCatalog extends ColoredCatalog {
  /** The item's GLB, or undefined for items drawn as placeholder boxes. */
  modelUrlOf(id: CatalogId): string | undefined;
}

/**
 * The manifest's items first, then the stub boxes that have no model yet (bed, shelf, plant).
 * Ids never clash: the stub's are not in the manifest.
 */
export const appCatalog: AppCatalog = {
  getItem: (id) => modelCatalog.getItem(id) ?? stubCatalog.getItem(id),
  colorOf: (id) => modelCatalog.colorOf(id) ?? stubCatalog.colorOf(id),
  modelUrlOf: (id) => modelCatalog.modelUrlOf(id),
};

const ENTRIES: readonly CatalogEntry[] = [
  ...modelCatalog.entries().map((item) => {
    const thumbnail = modelCatalog.thumbnailUrlOf(item.id);
    return {
      id: item.id,
      name: item.name,
      size: item.size,
      color: modelCatalog.colorOf(item.id) ?? '#7aa2d6',
      ...(thumbnail ? { thumbnail } : {}),
    };
  }),
  ...stubEntries(),
];

/** Every item of the catalog, in the order the panel lists them. */
export function catalogEntries(): readonly CatalogEntry[] {
  return ENTRIES;
}
