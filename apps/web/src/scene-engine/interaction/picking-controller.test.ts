import type { ObjectId } from '@roomforge/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPicking, CLICK_SLOP_PX } from './picking-controller';

/** A 200 × 100 element at the page origin; the left half "contains" object a. */
function setup() {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;
  const frames: (() => void)[] = [];
  const pick = vi.fn((ndcX: number) => (ndcX < 0 ? ('a' as ObjectId) : null));
  const onHover = vi.fn();
  const onClick = vi.fn();
  const drag = {
    start: vi.fn((_id: ObjectId, _x: number, _y: number, _vertical: boolean) => true),
    move: vi.fn(),
    end: vi.fn(),
    cancel: vi.fn(),
    turn: vi.fn(),
  };
  // The rotation handle sits in the right quarter of the element.
  const rotate = {
    hit: vi.fn((ndcX: number) => (ndcX > 0.5 ? ('a' as ObjectId) : null)),
    start: vi.fn((_id: ObjectId, _x: number, _y: number) => true),
    move: vi.fn(),
    end: vi.fn(),
    cancel: vi.fn(),
  };
  const detach = attachPicking({
    element,
    pick,
    onHover,
    onClick,
    drag,
    rotate,
    requestFrame: (callback) => frames.push(callback),
    cancelFrame: (handle) => {
      frames[handle - 1] = () => {};
    },
  });
  const flush = () => {
    for (const frame of frames.splice(0)) frame();
  };
  const pointer = (type: string, x: number, init: PointerEventInit = {}) =>
    element.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: 50, ...init }));
  // happy-dom's WheelEvent drops the modifier keys, so build it from a MouseEvent.
  const wheel = (deltaY: number, init: MouseEventInit = {}) => {
    const event = new MouseEvent('wheel', { cancelable: true, ...init });
    Object.defineProperty(event, 'deltaY', { value: deltaY });
    element.dispatchEvent(event);
    return event;
  };
  return { element, pick, onHover, onClick, drag, rotate, detach, flush, pointer, wheel };
}

let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});
afterEach(() => ctx.detach());

describe('attachPicking: hover', () => {
  it('picks at most once per frame however many moves arrive', () => {
    for (let x = 10; x < 60; x += 5) ctx.pointer('pointermove', x);
    expect(ctx.pick).not.toHaveBeenCalled();
    ctx.flush();
    expect(ctx.pick).toHaveBeenCalledTimes(1);
  });

  it('reports the hovered object only when it changes', () => {
    ctx.pointer('pointermove', 20);
    ctx.flush();
    ctx.pointer('pointermove', 30);
    ctx.flush();
    expect(ctx.onHover.mock.calls).toEqual([['a']]);
    ctx.pointer('pointermove', 150);
    ctx.flush();
    expect(ctx.onHover.mock.calls).toEqual([['a'], [null]]);
  });

  it('converts to normalised device coordinates (y up)', () => {
    ctx.pointer('pointermove', 50, { clientY: 25 });
    ctx.flush();
    expect(ctx.pick).toHaveBeenCalledWith(-0.5, 0.5);
  });

  it('clears the hover when the pointer leaves and cancels a pending pick', () => {
    ctx.pointer('pointermove', 20);
    ctx.flush();
    ctx.pointer('pointermove', 150);
    ctx.pointer('pointerleave', 150);
    ctx.flush();
    expect(ctx.onHover.mock.calls).toEqual([['a'], [null]]);
    expect(ctx.pick).toHaveBeenCalledTimes(1);
  });
});

describe('attachPicking: click', () => {
  it('selects on a left click without drag, and reports Shift', () => {
    ctx.pointer('pointerdown', 20, { button: 0 });
    ctx.pointer('pointerup', 21, { button: 0, shiftKey: true });
    expect(ctx.onClick).toHaveBeenCalledWith('a', true);
  });

  it('reports a click on empty space as null', () => {
    ctx.pointer('pointerdown', 150, { button: 0 });
    ctx.pointer('pointerup', 150, { button: 0 });
    expect(ctx.onClick).toHaveBeenCalledWith(null, false);
  });

  it('ignores drags, other buttons and releases without a press', () => {
    ctx.pointer('pointerdown', 20, { button: 0 });
    ctx.pointer('pointerup', 20 + CLICK_SLOP_PX + 1, { button: 0 });
    ctx.pointer('pointerdown', 20, { button: 2 });
    ctx.pointer('pointerup', 20, { button: 2 });
    ctx.pointer('pointerup', 20, { button: 0 });
    expect(ctx.onClick).not.toHaveBeenCalled();
  });

  it('stops listening after cleanup', () => {
    ctx.detach();
    ctx.pointer('pointerdown', 20, { button: 0 });
    ctx.pointer('pointerup', 20, { button: 0 });
    ctx.pointer('pointermove', 20);
    ctx.flush();
    expect(ctx.onClick).not.toHaveBeenCalled();
    expect(ctx.pick).not.toHaveBeenCalled();
  });
});

describe('attachPicking: drag', () => {
  it('starts a drag after the click slop on an object, from where it was pressed', () => {
    ctx.pointer('pointerdown', 20, { button: 0 });
    ctx.pointer('pointermove', 20 + CLICK_SLOP_PX + 2);
    expect(ctx.drag.start).toHaveBeenCalledWith('a', -0.8, 0, false);
  });

  it('a drag pressed with Shift is vertical (P3-16); a Shift click still toggles', () => {
    ctx.pointer('pointerdown', 20, { button: 0, shiftKey: true });
    ctx.pointer('pointermove', 20 + CLICK_SLOP_PX + 2);
    expect(ctx.drag.start).toHaveBeenCalledWith('a', -0.8, 0, true);
    ctx.pointer('pointerup', 20 + CLICK_SLOP_PX + 2, { button: 0 });
    ctx.pointer('pointerdown', 20, { button: 0, shiftKey: true });
    ctx.pointer('pointerup', 20, { button: 0, shiftKey: true });
    expect(ctx.onClick).toHaveBeenCalledWith('a', true);
  });

  it('moves at most once per frame, passes Alt, and ends without a click', () => {
    ctx.pointer('pointerdown', 20, { button: 0 });
    ctx.pointer('pointermove', 30);
    ctx.pointer('pointermove', 40);
    ctx.pointer('pointermove', 50, { altKey: true });
    ctx.flush();
    expect(ctx.drag.move).toHaveBeenCalledTimes(1);
    expect(ctx.drag.move).toHaveBeenCalledWith(-0.5, 0, true);
    ctx.pointer('pointerup', 60, { button: 0 });
    // The pending position is applied before ending.
    expect(ctx.drag.move).toHaveBeenLastCalledWith(-0.4, 0, false);
    expect(ctx.drag.end).toHaveBeenCalledOnce();
    expect(ctx.onClick).not.toHaveBeenCalled();
  });

  it('does not hover while dragging', () => {
    ctx.pointer('pointerdown', 20, { button: 0 });
    ctx.pointer('pointermove', 40);
    ctx.flush();
    expect(ctx.pick).toHaveBeenCalledTimes(1); // only the press
    expect(ctx.onHover).not.toHaveBeenCalled();
  });

  it('never drags from empty space, and a refused drag is not a click either', () => {
    ctx.pointer('pointerdown', 150, { button: 0 });
    ctx.pointer('pointermove', 170);
    ctx.pointer('pointerup', 170, { button: 0 });
    expect(ctx.drag.start).not.toHaveBeenCalled();

    ctx.drag.start.mockReturnValueOnce(false);
    ctx.pointer('pointerdown', 20, { button: 0 });
    ctx.pointer('pointermove', 40);
    ctx.pointer('pointerup', 40, { button: 0 });
    expect(ctx.drag.end).not.toHaveBeenCalled();
    expect(ctx.onClick).not.toHaveBeenCalled();
  });

  it('Escape cancels the drag instead of ending it', () => {
    ctx.pointer('pointerdown', 20, { button: 0 });
    ctx.pointer('pointermove', 40);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctx.drag.cancel).toHaveBeenCalledOnce();
    ctx.pointer('pointerup', 40, { button: 0 });
    expect(ctx.drag.end).not.toHaveBeenCalled();
    expect(ctx.onClick).not.toHaveBeenCalled();
  });

  it('cancels a drag in progress on cleanup', () => {
    ctx.pointer('pointerdown', 20, { button: 0 });
    ctx.pointer('pointermove', 40);
    ctx.detach();
    expect(ctx.drag.cancel).toHaveBeenCalledOnce();
  });
});

describe('attachPicking: rotation handle', () => {
  it('starts turning at once on the handle, without waiting for the click slop', () => {
    ctx.pointer('pointerdown', 190, { button: 0 });
    expect(ctx.rotate.start).toHaveBeenCalledOnce();
    const [id, ndcX, ndcY] = ctx.rotate.start.mock.calls[0] ?? [];
    expect(id).toBe('a');
    expect(ndcX).toBeCloseTo(0.9);
    expect(ndcY).toBeCloseTo(0);
    expect(ctx.drag.start).not.toHaveBeenCalled();
  });

  it('moves at most once per frame, passes Alt, and ends without a click', () => {
    ctx.pointer('pointerdown', 190, { button: 0 });
    ctx.pointer('pointermove', 180);
    ctx.pointer('pointermove', 170, { altKey: true });
    ctx.flush();
    expect(ctx.rotate.move).toHaveBeenCalledTimes(1);
    expect(ctx.rotate.move.mock.calls[0]?.[0]).toBeCloseTo(0.7);
    expect(ctx.rotate.move.mock.calls[0]?.[2]).toBe(true);
    ctx.pointer('pointerup', 160, { button: 0 });
    expect(ctx.rotate.move).toHaveBeenCalledTimes(2);
    expect(ctx.rotate.move.mock.lastCall?.[0]).toBeCloseTo(0.6);
    expect(ctx.rotate.move.mock.lastCall?.[2]).toBe(false);
    expect(ctx.rotate.end).toHaveBeenCalledOnce();
    expect(ctx.onClick).not.toHaveBeenCalled();
    expect(ctx.drag.move).not.toHaveBeenCalled();
  });

  it('a refused handle press is ignored, not turned into a click or a drag', () => {
    ctx.rotate.start.mockReturnValueOnce(false);
    ctx.pointer('pointerdown', 190, { button: 0 });
    ctx.pointer('pointermove', 170);
    ctx.pointer('pointerup', 170, { button: 0 });
    expect(ctx.rotate.move).not.toHaveBeenCalled();
    expect(ctx.rotate.end).not.toHaveBeenCalled();
    expect(ctx.onClick).not.toHaveBeenCalled();
  });

  it('Escape cancels the turn instead of ending it', () => {
    ctx.pointer('pointerdown', 190, { button: 0 });
    ctx.pointer('pointermove', 170);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctx.rotate.cancel).toHaveBeenCalledOnce();
    ctx.pointer('pointerup', 170, { button: 0 });
    expect(ctx.rotate.end).not.toHaveBeenCalled();
  });

  it('cancels a turn in progress on cleanup', () => {
    ctx.pointer('pointerdown', 190, { button: 0 });
    ctx.detach();
    expect(ctx.rotate.cancel).toHaveBeenCalledOnce();
  });

  it('hovering the handle shows a grab cursor and does not hover the object', () => {
    ctx.pointer('pointermove', 190);
    ctx.flush();
    expect(ctx.element.style.cursor).toBe('grab');
    expect(ctx.onHover).not.toHaveBeenCalled();
    ctx.pointer('pointermove', 100);
    ctx.flush();
    expect(ctx.element.style.cursor).toBe('');
  });
});

describe('attachPicking: turning while dragging an object', () => {
  const startDrag = () => {
    ctx.pointer('pointerdown', 20, { button: 0 });
    ctx.pointer('pointermove', 40);
  };

  it('the wheel turns one step per notch, Alt for the fine step', () => {
    startDrag();
    const up = ctx.wheel(-100);
    expect(ctx.drag.turn).toHaveBeenLastCalledWith(1, false);
    expect(up.defaultPrevented).toBe(true);
    ctx.wheel(100);
    expect(ctx.drag.turn).toHaveBeenLastCalledWith(-1, false);
    ctx.wheel(-100, { altKey: true });
    expect(ctx.drag.turn).toHaveBeenLastCalledWith(1, true);
  });

  it('R turns one step, Shift+R the other way', () => {
    startDrag();
    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
      window.dispatchEvent(event);
      return event;
    };
    expect(press({ key: 'r' }).defaultPrevented).toBe(true);
    expect(ctx.drag.turn).toHaveBeenLastCalledWith(1, false);
    press({ key: 'R', shiftKey: true });
    expect(ctx.drag.turn).toHaveBeenLastCalledWith(-1, false);
    press({ key: 'r', altKey: true });
    expect(ctx.drag.turn).toHaveBeenLastCalledWith(1, true);
    press({ key: 'r', ctrlKey: true });
    expect(ctx.drag.turn).toHaveBeenCalledTimes(3);
  });

  it('leaves the wheel and R alone when nothing is being dragged', () => {
    const event = ctx.wheel(-100);
    expect(event.defaultPrevented).toBe(false);
    const key = new KeyboardEvent('keydown', { key: 'r', cancelable: true });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(ctx.drag.turn).not.toHaveBeenCalled();
  });
});
