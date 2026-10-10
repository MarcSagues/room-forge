/** Public API of the asset-library module (catalog and, later, models and textures). */
import type { CatalogProvider } from '@roomforge/core';

export { createManifestCatalog, type ManifestCatalog, modelCatalog } from './manifest-catalog';
export {
  type CatalogEntry,
  type ColoredCatalog,
  catalogEntries,
  stubCatalog,
} from './stub-catalog';

/** Catalog with no items: every `catalogId` is "unknown", which the document tolerates (I6). */
export const emptyCatalog: CatalogProvider = {
  getItem: () => undefined,
};
