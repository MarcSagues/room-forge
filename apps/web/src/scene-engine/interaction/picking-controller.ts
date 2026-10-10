import type { EntityId } from '@roomforge/core';

/** A press that moved less than this (px) between down and up is a click, not a drag. */
export const CLICK_SLOP_PX = 4;

export interface DragHandlers {
  /**
   * The pointer was pressed on `id` and moved past the click slop. `ndcX/Y` is where it was
   * pressed. Return false to refuse (e.g. a stacked or locked object): the press is then ignored.
   */
  start(id: EntityId, ndcX: number, ndcY: number): boolean;
  /** At most once per animation frame. `free` = Alt held (no snapping). */
  move(ndcX: number, ndcY: number, free: boolean): void;
  end(): void;
  /** Esc during the drag. */
  cancel(): void;
  /**
   * A wheel notch or an `R` press while dragging: `steps` whole angle steps (negative = the other
   * way); `fine` = Alt held (the fine step).
   */
  turn?(steps: number, fine: boolean): void;
}

/** The rotation handle: pressing on it starts turning at once, with no click slop. */
export interface HandleHandlers extends DragHandlers {
  /** The object whose handle is under normalised device coordinates, or null. */
  hit(ndcX: number, ndcY: number): EntityId | null;
}

export interface PickingDeps {
  /** The canvas element: pointer events are listened to here. */
  element: HTMLElement;
  /** Object under normalised device coordinates (-1..1, y up), or null. */
  pick(ndcX: number, ndcY: number): EntityId | null;
  /** Called only when the hovered object changes. */
  onHover(id: EntityId | null): void;
  /** A left click without drag: the picked object (null on empty space) and whether Shift was held. */
  onClick(id: EntityId | null, additive: boolean): void;
  /** Dragging an object with the left button (optional). */
  drag?: DragHandlers;
  /** Turning an object with its rotation handle (optional). */
  rotate?: HandleHandlers;
  /** Where Esc is listened to while dragging (the window). */
  keyTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
}

/**
 * Pointer → hover, selection and drag without React (AGENTS rule 3): `pointermove` only records
 * the pointer; at most one pick or drag step runs per animation frame, and `onHover` fires only
 * when the result changes. Returns the cleanup that removes every listener.
 */
export function attachPicking(deps: PickingDeps): () => void {
  const { element } = deps;
  const requestFrame = deps.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  const cancelFrame = deps.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  const keyTarget = deps.keyTarget ?? (typeof window === 'undefined' ? undefined : window);
  let pointerX = 0;
  let pointerY = 0;
  let alt = false;
  let scheduled: number | null = null;
  let hovered: EntityId | null = null;
  let downX = 0;
  let downY = 0;
  let pressing = false;
  let pressedOn: EntityId | null = null;
  let dragging = false;
  /** Who gets the move/end/cancel of the gesture in progress: the drag or the rotation handle. */
  let active: DragHandlers | undefined;
  let handleHovered = false;
  let pointerId = -1;

  /** Past the click slop since the press? (Squares: Math.hypot allocates on every call.) */
  const pastSlop = (clientX: number, clientY: number) => {
    const dx = clientX - downX;
    const dy = clientY - downY;
    return dx * dx + dy * dy > CLICK_SLOP_PX * CLICK_SLOP_PX;
  };

  const toNdc = (clientX: number, clientY: number, out: { x: number; y: number }) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    out.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    out.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  };
  const ndc = { x: 0, y: 0 };
  const pickAt = (clientX: number, clientY: number) =>
    toNdc(clientX, clientY, ndc) ? deps.pick(ndc.x, ndc.y) : null;

  const setHovered = (id: EntityId | null) => {
    if (id === hovered) return;
    hovered = id;
    deps.onHover(id);
  };

  const setHandleHovered = (over: boolean) => {
    if (over === handleHovered) return;
    handleHovered = over;
    element.style.cursor = over ? 'grab' : '';
  };

  const runFrame = () => {
    scheduled = null;
    if (dragging) {
      if (toNdc(pointerX, pointerY, ndc)) active?.move(ndc.x, ndc.y, alt);
    } else if (toNdc(pointerX, pointerY, ndc)) {
      const overHandle = deps.rotate ? deps.rotate.hit(ndc.x, ndc.y) !== null : false;
      setHandleHovered(overHandle);
      setHovered(overHandle ? null : deps.pick(ndc.x, ndc.y));
    } else {
      setHovered(null);
    }
  };

  const stopDrag = () => {
    dragging = false;
    active = undefined;
    pressing = false;
    pressedOn = null;
    if (pointerId >= 0 && element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
    pointerId = -1;
    element.style.cursor = handleHovered ? 'grab' : '';
  };

  const onMove = (event: PointerEvent) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    alt = event.altKey;
    if (pressing && !dragging && pressedOn && deps.drag) {
      if (pastSlop(event.clientX, event.clientY)) {
        dragging = toNdc(downX, downY, ndc) && deps.drag.start(pressedOn, ndc.x, ndc.y);
        if (dragging) {
          active = deps.drag;
          pointerId = event.pointerId;
          element.setPointerCapture?.(event.pointerId);
          setHovered(null);
        } else {
          pressing = false; // refused: this press is neither a click nor a drag
        }
      }
    }
    scheduled ??= requestFrame(runFrame);
  };

  const onLeave = () => {
    if (dragging) return; // pointer capture keeps the drag alive outside the canvas
    if (scheduled !== null) cancelFrame(scheduled);
    scheduled = null;
    setHovered(null);
  };

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    downX = event.clientX;
    downY = event.clientY;
    const handle = deps.rotate && toNdc(downX, downY, ndc) ? deps.rotate.hit(ndc.x, ndc.y) : null;
    if (handle && deps.rotate) {
      // The handle is a control of its own: it takes the press before any object does.
      if (deps.rotate.start(handle, ndc.x, ndc.y)) {
        dragging = true;
        active = deps.rotate;
        pointerId = event.pointerId;
        element.setPointerCapture?.(event.pointerId);
        element.style.cursor = 'grabbing';
        setHovered(null);
      }
      return;
    }
    pressing = true;
    pressedOn = deps.drag ? pickAt(event.clientX, event.clientY) : null;
  };

  const onUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (dragging) {
      // Drop where the pointer was released, even if that position has not had its frame yet.
      if (scheduled !== null) cancelFrame(scheduled);
      scheduled = null;
      if (toNdc(event.clientX, event.clientY, ndc)) active?.move(ndc.x, ndc.y, event.altKey);
      active?.end();
      stopDrag();
      return;
    }
    if (!pressing) return;
    pressing = false;
    pressedOn = null;
    if (pastSlop(event.clientX, event.clientY)) return;
    deps.onClick(pickAt(event.clientX, event.clientY), event.shiftKey);
  };

  const onKey = (event: KeyboardEvent) => {
    if (!dragging) return;
    if (event.key === 'Escape') {
      // The drag owns this Escape: it must not also clear the selection.
      event.stopImmediatePropagation();
      event.preventDefault();
      if (scheduled !== null) cancelFrame(scheduled);
      scheduled = null;
      active?.cancel();
      stopDrag();
    } else if (
      active?.turn &&
      event.key.toLowerCase() === 'r' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.repeat
    ) {
      event.preventDefault();
      active.turn(event.shiftKey ? -1 : 1, event.altKey);
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (!dragging || !active?.turn) return;
    // The camera is locked while dragging: the wheel turns the object instead of zooming.
    event.preventDefault();
    active.turn(event.deltaY < 0 ? 1 : -1, event.altKey);
  };

  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerleave', onLeave);
  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('wheel', onWheel, { passive: false });
  // Capture phase, so it runs before the editor's Escape hotkey.
  keyTarget?.addEventListener('keydown', onKey as EventListener, true);
  return () => {
    if (scheduled !== null) cancelFrame(scheduled);
    if (dragging) active?.cancel();
    setHandleHovered(false);
    element.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerleave', onLeave);
    element.removeEventListener('pointerdown', onDown);
    element.removeEventListener('pointerup', onUp);
    element.removeEventListener('wheel', onWheel);
    keyTarget?.removeEventListener('keydown', onKey as EventListener, true);
  };
}
