import type { ObjectId } from '@roomforge/core';

/** A press that moved less than this (px) between down and up is a click, not a drag. */
export const CLICK_SLOP_PX = 4;

export interface PickingDeps {
  /** The canvas element: pointer events are listened to here. */
  element: HTMLElement;
  /** Object under normalised device coordinates (-1..1, y up), or null. */
  pick(ndcX: number, ndcY: number): ObjectId | null;
  /** Called only when the hovered object changes. */
  onHover(id: ObjectId | null): void;
  /** A left click without drag: the picked object (null on empty space) and whether Shift was held. */
  onClick(id: ObjectId | null, additive: boolean): void;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
}

/**
 * Pointer → hover/selection without React (AGENTS rule 3): `pointermove` only records the pointer;
 * at most one pick runs per animation frame, and `onHover` fires only when the result changes.
 * Returns the cleanup that removes every listener.
 */
export function attachPicking(deps: PickingDeps): () => void {
  const { element } = deps;
  const requestFrame = deps.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  const cancelFrame = deps.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  let pointerX = 0;
  let pointerY = 0;
  let scheduled: number | null = null;
  let hovered: ObjectId | null = null;
  let downX = 0;
  let downY = 0;
  let pressing = false;

  const pickAt = (clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    return deps.pick(ndcX, ndcY);
  };

  const setHovered = (id: ObjectId | null) => {
    if (id === hovered) return;
    hovered = id;
    deps.onHover(id);
  };

  const runHover = () => {
    scheduled = null;
    setHovered(pickAt(pointerX, pointerY));
  };

  const onMove = (event: PointerEvent) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    scheduled ??= requestFrame(runHover);
  };

  const onLeave = () => {
    if (scheduled !== null) cancelFrame(scheduled);
    scheduled = null;
    setHovered(null);
  };

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pressing = true;
    downX = event.clientX;
    downY = event.clientY;
  };

  const onUp = (event: PointerEvent) => {
    if (event.button !== 0 || !pressing) return;
    pressing = false;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > CLICK_SLOP_PX) return;
    deps.onClick(pickAt(event.clientX, event.clientY), event.shiftKey);
  };

  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerleave', onLeave);
  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointerup', onUp);
  return () => {
    if (scheduled !== null) cancelFrame(scheduled);
    element.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerleave', onLeave);
    element.removeEventListener('pointerdown', onDown);
    element.removeEventListener('pointerup', onUp);
  };
}
