import {
  type CatalogProvider,
  type EditorSession,
  moveObjects,
  type ObjectId,
  solvePlacement,
  type Vec3,
} from '@roomforge/core';
import { objectSize } from '../objects/placeholder-resources';
import { DEFAULT_DRAG_GRID } from './move-controller';
import type { TransientStore } from './transient-store';

/** One arrow press moves the selection this far (metres); Shift multiplies it by ten. */
export const NUDGE_STEP = DEFAULT_DRAG_GRID;
export const NUDGE_FAST_FACTOR = 10;

/** Room axes: x grows to the east, z to the south (up on screen in the top view is north). */
const DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Widgets that use the arrows themselves; a focused one keeps them. */
const ARROW_WIDGETS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="spinbutton"], [role="tablist"], [role="menu"], [role="menubar"], [role="listbox"], [role="radiogroup"], [role="tree"], [role="grid"], [role="dialog"]';

function ownsArrows(target: EventTarget | null): boolean {
  const element = target as Partial<Element> | null;
  return element?.closest?.(ARROW_WIDGETS) != null;
}

export interface NudgeDeps {
  session: EditorSession;
  catalog: CatalogProvider;
  transient: TransientStore;
  /** Where arrows are listened to (the window). */
  keyTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Arrow keys move the selected floor objects one step (Shift ×10) along the room axes, each press
 * a single `object/move` (a held key coalesces into one undo entry). The result is kept inside the
 * room; wall snap is off, otherwise a step of 10 cm could never leave a wall's 15 cm band.
 * Returns the cleanup that removes the listener.
 */
export function attachNudge(deps: NudgeDeps): () => void {
  const keyTarget = deps.keyTarget ?? (typeof window === 'undefined' ? undefined : window);

  const onKey = (event: KeyboardEvent) => {
    const direction = DIRECTIONS[event.key];
    // Ctrl/Meta/Alt + arrow belong to the browser (history, word jumps, text selection).
    if (!direction || event.ctrlKey || event.metaKey || event.altKey) return;
    if (ownsArrows(event.target) || deps.transient.drag()) return;
    const { selection, document } = deps.session.getState();
    if (selection.length === 0) return;
    event.preventDefault();

    const step = NUDGE_STEP * (event.shiftKey ? NUDGE_FAST_FACTOR : 1);
    const moves: { id: ObjectId; position: Vec3 }[] = [];
    for (const id of selection) {
      const object = document.objects[id as ObjectId];
      const room = object ? document.rooms[object.roomId] : undefined;
      if (!object || !room || object.parentId !== null || object.locked || object.hidden) continue;
      const size = objectSize(deps.catalog, object.catalogId);
      const [sx, , sz] = object.transform.scale ?? [1, 1, 1];
      const [x, y, z] = object.transform.position;
      const placed = solvePlacement({
        room: { width: room.shape.width, depth: room.shape.depth },
        size: { w: size.w * sx, d: size.d * sz },
        position: [x + direction[0] * step, z + direction[1] * step],
        rotationY: object.transform.rotationY,
        wallSnap: false,
      });
      if (!placed.valid || (placed.position[0] === x && placed.position[1] === z)) continue;
      moves.push({ id: object.id, position: [placed.position[0], y, placed.position[1]] });
    }
    if (moves.length > 0) deps.session.execute(moveObjects(moves));
  };

  keyTarget?.addEventListener('keydown', onKey as EventListener);
  return () => keyTarget?.removeEventListener('keydown', onKey as EventListener);
}
