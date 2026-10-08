import { MeshBuilder, type MeshData } from './mesh-data';

/**
 * Floor of the interior (`x ∈ [0, width]`, `z ∈ [0, depth]`) at y = 0, facing up. UVs are world
 * metres so a texture repeats once per metre whatever the room size (P5-02).
 */
export function buildFloorMesh(width: number, depth: number): MeshData {
  const mesh = new MeshBuilder();
  mesh.quad(
    [
      [0, 0, 0],
      [width, 0, 0],
      [width, 0, depth],
      [0, 0, depth],
    ],
    [0, 1, 0],
    [
      [0, 0],
      [width, 0],
      [width, depth],
      [0, depth],
    ],
  );
  return mesh.build();
}

/** Ceiling at y = height, facing down into the room (it is hidden when seen from above). */
export function buildCeilingMesh(width: number, depth: number, height: number): MeshData {
  const mesh = new MeshBuilder();
  mesh.quad(
    [
      [0, height, 0],
      [width, height, 0],
      [width, height, depth],
      [0, height, depth],
    ],
    [0, -1, 0],
    [
      [0, 0],
      [width, 0],
      [width, depth],
      [0, depth],
    ],
  );
  return mesh.build();
}
