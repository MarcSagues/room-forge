import type { Object3D } from 'three';

/**
 * `userData` key of editor-only drawings (grid, selection outline, rotation handle, drag guides,
 * placement ghost): they help while editing but never belong in an exported image.
 */
export const OVERLAY_KEY = 'editorOverlay';

/** Marks `object` (and so everything under it) as an editor overlay. Returns it, for chaining. */
export function markOverlay<T extends Object3D>(object: T): T {
  object.userData[OVERLAY_KEY] = true;
  return object;
}

/**
 * Hides every overlay of `root` with `visible` (nothing is unmounted, AGENTS rule 7) and returns
 * the function that puts back exactly what was visible before. Not for the hot path: an export
 * calls it once.
 */
export function hideOverlays(root: Object3D): () => void {
  const hidden: Object3D[] = [];
  root.traverse((object) => {
    if (object.userData[OVERLAY_KEY] === true && object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  });
  return () => {
    for (const object of hidden) object.visible = true;
  };
}
