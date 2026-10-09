import type { CatalogId, MaterialRef } from '../domain';

export type PlacementSurface = 'floor' | 'wall' | 'ceiling' | 'tabletop';

/** A part of an item that can take its own material (a desk top, its frame), with its default. */
export interface MaterialSlot {
  readonly id: string;
  readonly default: MaterialRef;
}

/**
 * The part of a catalog item (DOMAIN_MODEL §3.1) that core needs to check invariants. The full
 * manifest entry (names, models, licences) lives in the web asset library.
 */
export interface CatalogItem {
  readonly id: CatalogId;
  /** Real bounding box in metres. */
  readonly size: { readonly w: number; readonly h: number; readonly d: number };
  /** Allowed surfaces; the first one is the default. */
  readonly placement: { readonly surfaces: readonly [PlacementSurface, ...PlacementSurface[]] };
  /** The material slots of the item; an item without any cannot be given a material. */
  readonly slots?: readonly MaterialSlot[];
}

/** Read-only catalog port; unknown ids return `undefined` and are kept in the document (I6). */
export interface CatalogProvider {
  getItem(id: CatalogId): CatalogItem | undefined;
}
