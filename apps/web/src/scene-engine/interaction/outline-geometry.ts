import { BoxGeometry, EdgesGeometry } from 'three';

let edges: EdgesGeometry | undefined;

/**
 * The edges of a unit box with its bottom on the floor (like the placeholder box), shared by every
 * outline and ghost: scale it per object (AGENTS rule 6, never one per instance).
 */
export function outlineGeometry(): EdgesGeometry {
  edges ??= new EdgesGeometry(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  return edges;
}
