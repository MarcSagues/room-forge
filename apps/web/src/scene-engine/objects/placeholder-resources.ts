import type { CatalogProvider } from '@roomforge/core';
import { BoxGeometry, MeshStandardMaterial } from 'three';

/**
 * One geometry and one material shared by every placeholder object (rule 6: never per instance).
 * Meshes use them with `dispose={null}`; they live as long as the page. Real models arrive with
 * the catalog (P4) through the ResourceRegistry.
 */
let shared: { geometry: BoxGeometry; material: MeshStandardMaterial } | undefined;

/** Size of objects the catalog does not know (I6), and of everything while the catalog is empty. */
export const PLACEHOLDER_SIZE = 0.5;

const UNKNOWN_SIZE = { w: PLACEHOLDER_SIZE, h: PLACEHOLDER_SIZE, d: PLACEHOLDER_SIZE } as const;

export type ObjectSize = { readonly w: number; readonly h: number; readonly d: number };

/** Bounding size of an object before its own scale: the catalog's, or the placeholder cube. */
export function objectSize(catalog: CatalogProvider, catalogId: string): ObjectSize {
  return catalog.getItem(catalogId)?.size ?? UNKNOWN_SIZE;
}

export function placeholderResources() {
  shared ??= {
    // A unit box with its bottom face on the floor (an object's origin is its footprint centre at
    // floor level), scaled per object to its size.
    geometry: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    material: new MeshStandardMaterial({ color: '#7aa2d6', roughness: 0.8 }),
  };
  return shared;
}
