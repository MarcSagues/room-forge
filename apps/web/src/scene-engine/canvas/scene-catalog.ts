import type { CatalogProvider } from '@roomforge/core';

/** The core port, plus what the scene draws an item with when the host has it. */
export interface SceneCatalog extends CatalogProvider {
  /** Colour of the item's placeholder box. */
  colorOf?(id: string): string | undefined;
  /** URL of the item's GLB; items without one are drawn as placeholder boxes. */
  modelUrlOf?(id: string): string | undefined;
}
