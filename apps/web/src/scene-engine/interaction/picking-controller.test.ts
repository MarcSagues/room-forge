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
  const detach = attachPicking({
    element,
    pick,
    onHover,
    onClick,
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
  return { element, pick, onHover, onClick, detach, flush, pointer };
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
