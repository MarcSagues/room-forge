import { BoxGeometry, MeshStandardMaterial } from 'three';

/**
 * One geometry and one material shared by every placeholder object (rule 6: never per instance).
 * Meshes use them with `dispose={null}`; they live as long as the page. Real models arrive with
 * the catalog (P3) through the ResourceRegistry.
 */
let shared: { geometry: BoxGeometry; material: MeshStandardMaterial } | undefined;

export const PLACEHOLDER_SIZE = 0.5;

export function placeholderResources() {
  shared ??= {
    // Bottom face on the floor: an object's origin is its footprint centre at floor level.
    geometry: new BoxGeometry(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE).translate(
      0,
      PLACEHOLDER_SIZE / 2,
      0,
    ),
    material: new MeshStandardMaterial({ color: '#7aa2d6', roughness: 0.8 }),
  };
  return shared;
}
