import {
  type CatalogCategory,
  type CatalogId,
  type CatalogItem,
  type CatalogManifest,
  type CatalogManifestItem,
  CatalogManifestSchema,
  toCatalogItem,
} from '@roomforge/core';
import manifestJson from './manifest/catalog.json';

/** The real catalog (P4-02): the core port plus what the panel and the scene read from the manifest. */
export interface ManifestCatalog {
  getItem(id: CatalogId): CatalogItem | undefined;
  /** The full manifest entry: names, model, licence. */
  entry(id: CatalogId): CatalogManifestItem | undefined;
  byCategory(category: CatalogCategory): readonly CatalogManifestItem[];
  byTag(tag: string): readonly CatalogManifestItem[];
  /** Every item, in manifest order. */
  entries(): readonly CatalogManifestItem[];
  /** Colour of the placeholder box: the item's first colour slot. */
  colorOf(id: CatalogId): string | undefined;
  /** Where the item's model is served from. */
  modelUrlOf(id: CatalogId): string | undefined;
}

/** `assetsBase` is the public folder the manifest's `models/…` paths are relative to. */
export function createManifestCatalog(
  manifest: CatalogManifest,
  assetsBase = '/assets/',
): ManifestCatalog {
  const byId = new Map(manifest.items.map((item) => [item.id, item]));
  const items = new Map(manifest.items.map((item) => [item.id, toCatalogItem(item)]));
  return {
    getItem: (id) => items.get(id),
    entry: (id) => byId.get(id),
    byCategory: (category) => manifest.items.filter((item) => item.category === category),
    byTag: (tag) => manifest.items.filter((item) => item.tags.includes(tag)),
    entries: () => manifest.items,
    colorOf: (id) => byId.get(id)?.slots[0]?.default.tint,
    modelUrlOf: (id) => {
      const item = byId.get(id);
      return item && `${assetsBase}${item.source.file}`;
    },
  };
}

/**
 * The catalog the app ships. The manifest is checked in CI (`pnpm catalog:validate`); parsing it
 * here also gives it its exact type.
 */
export const modelCatalog: ManifestCatalog = createManifestCatalog(
  CatalogManifestSchema.parse(manifestJson),
);
