/** Longest press (ms) that still counts as a tap. */
export const TAP_MAX_MS = 250;
/** Most a finger may move (px) during a tap, and between the two taps of a double tap. */
export const TAP_SLOP_PX = 24;
/** Longest gap (ms) between the end of the first tap and the start of the second. */
export const DOUBLE_TAP_GAP_MS = 300;

type PointerTarget = Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>;

export interface DoubleTapDeps {
  element: PointerTarget;
  onDoubleTap(): void;
  /** The clock (tests); by default each event's own `timeStamp`, when the finger actually moved. */
  now?: () => number;
}

/**
 * Two quick taps of one finger in the same place (touch only; the mouse has `F`). A tap is a press
 * shorter than `TAP_MAX_MS` that moved less than `TAP_SLOP_PX`; a press with a second finger down
 * at any point (a pinch) is not a tap. Primitive state only: no allocations per event.
 */
export function attachDoubleTap(deps: DoubleTapDeps): () => void {
  const { element, onDoubleTap, now } = deps;
  // The event's time, not the time it is handled: a busy main thread must not stretch a tap.
  const timeOf = (event: PointerEvent) => now?.() ?? event.timeStamp;
  let down = 0;
  let multi = false;
  let startX = 0;
  let startY = 0;
  let startAt = 0;
  let lastTapAt = Number.NEGATIVE_INFINITY;
  let lastTapX = 0;
  let lastTapY = 0;

  const near = (ax: number, ay: number, bx: number, by: number) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy <= TAP_SLOP_PX * TAP_SLOP_PX;
  };

  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    down += 1;
    if (down > 1) {
      multi = true;
      return;
    }
    multi = false;
    startX = event.clientX;
    startY = event.clientY;
    startAt = timeOf(event);
    // A second tap that starts too late, or elsewhere, begins a new pair instead.
    if (startAt - lastTapAt > DOUBLE_TAP_GAP_MS || !near(startX, startY, lastTapX, lastTapY)) {
      lastTapAt = Number.NEGATIVE_INFINITY;
    }
  };

  const onUp = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || down === 0) return;
    down -= 1;
    if (down > 0 || multi) return;
    const at = timeOf(event);
    const tap = at - startAt <= TAP_MAX_MS && near(event.clientX, event.clientY, startX, startY);
    if (!tap) {
      lastTapAt = Number.NEGATIVE_INFINITY;
      return;
    }
    if (lastTapAt !== Number.NEGATIVE_INFINITY) {
      lastTapAt = Number.NEGATIVE_INFINITY;
      onDoubleTap();
      return;
    }
    lastTapAt = at;
    lastTapX = startX;
    lastTapY = startY;
  };

  const onCancel = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || down === 0) return;
    down -= 1;
    multi = true;
    lastTapAt = Number.NEGATIVE_INFINITY;
  };

  element.addEventListener('pointerdown', onDown as EventListener);
  element.addEventListener('pointerup', onUp as EventListener);
  element.addEventListener('pointercancel', onCancel as EventListener);
  return () => {
    element.removeEventListener('pointerdown', onDown as EventListener);
    element.removeEventListener('pointerup', onUp as EventListener);
    element.removeEventListener('pointercancel', onCancel as EventListener);
  };
}
