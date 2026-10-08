import type { CatalogProvider } from '@roomforge/core';

/**
 * Catalog with no items. The real manifest-backed provider arrives with P4-02; until then every
 * `catalogId` is "unknown", which the document tolerates (invariant I6).
 */
export const emptyCatalog: CatalogProvider = {
  getItem: () => undefined,
};
