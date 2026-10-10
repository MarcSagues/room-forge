/** Public API of the asset-library module: the catalog, its manifest and model loading. */
import type { CatalogProvider } from '@roomforge/core';

export { type AppCatalog, appCatalog, catalogEntries } from './app-catalog';
export { createManifestCatalog, type ManifestCatalog, modelCatalog } from './manifest-catalog';
export { loadModelParts, type ModelPart } from './models/load-model';
export { type CatalogEntry, type ColoredCatalog, stubCatalog } from './stub-catalog';

/** Catalog with no items: every `catalogId` is "unknown", which the document tolerates (I6). */
export const emptyCatalog: CatalogProvider = {
  getItem: () => undefined,
};
