import type { CatalogProvider } from '@roomforge/core';

/** The core port, plus the colour of an item's placeholder box when the host has one. */
export interface SceneCatalog extends CatalogProvider {
  colorOf?(id: string): string | undefined;
}
