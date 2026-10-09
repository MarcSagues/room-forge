/** Public API of the asset-library module (catalog and, later, models and textures). */
import type { CatalogProvider } from '@roomforge/core';

export {
  type CatalogEntry,
  type ColoredCatalog,
  catalogEntries,
  stubCatalog,
} from './stub-catalog';

/**
 * Catalog with no items. The real manifest-backed provider arrives with P4-02; until then every
 * `catalogId` is "unknown", which the document tolerates (invariant I6).
 */
export const emptyCatalog: CatalogProvider = {
  getItem: () => undefined,
};
