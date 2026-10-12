import type { CatalogId, HexColor, MaterialRef } from '../domain';

export type PlacementSurface = 'floor' | 'wall' | 'ceiling' | 'tabletop';

/** A part of an item that can take its own material (a desk top, its frame), with its default. */
export interface MaterialSlot {
  readonly id: string;
  readonly default: MaterialRef;
  /** The part of a luminaire that glows (its light source); only items with `light` have one. */
  readonly emissive?: true;
}

/** What an item that gives light is: its kind, its weight in the light budget, its colour. */
export interface LightCapability {
  readonly kind: 'strip' | 'bar' | 'panel' | 'point' | 'spot' | 'neon';
  /** Weight in the scene's light budget (0 = emissive only, no real light). */
  readonly cost: 0 | 1 | 2;
  readonly defaultColor: HexColor;
}

/**
 * A flat area of an item other items can stand on (a desk top), in the item's own frame: `y` is its
 * height above the item's base and `rect` is centred at `(x, z)` from the footprint centre, before
 * the item's scale. Objects standing on it are stored in that same frame.
 */
export interface SupportSurface {
  readonly y: number;
  readonly rect: { readonly x: number; readonly z: number; readonly w: number; readonly d: number };
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
  /** Areas `tabletop` items can stand on (a desk top); most items have none. */
  readonly supports?: readonly SupportSurface[];
  /** The material slots of the item; an item without any cannot be given a material. */
  readonly slots?: readonly MaterialSlot[];
  /** Present only on items that give light: only those take a `light` state. */
  readonly light?: LightCapability;
}

/** Read-only catalog port; unknown ids return `undefined` and are kept in the document (I6). */
export interface CatalogProvider {
  getItem(id: CatalogId): CatalogItem | undefined;
}
