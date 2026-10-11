import { describe, expect, it, vi } from 'vitest';
import { attachDoubleTap, DOUBLE_TAP_GAP_MS, TAP_MAX_MS, TAP_SLOP_PX } from './double-tap';

function setup() {
  const element = new EventTarget() as unknown as HTMLElement;
  const onDoubleTap = vi.fn();
  let time = 0;
  const detach = attachDoubleTap({ element, onDoubleTap, now: () => time });
  const fire = (type: string, x = 100, y = 100, id = 1, pointerType = 'touch') => {
    const event = new Event(type) as Event & Record<string, unknown>;
    Object.assign(event, { clientX: x, clientY: y, pointerId: id, pointerType });
    element.dispatchEvent(event);
  };
  const tap = (x = 100, y = 100, hold = 50) => {
    fire('pointerdown', x, y);
    time += hold;
    fire('pointerup', x, y);
  };
  const wait = (ms: number) => {
    time += ms;
  };
  return { onDoubleTap, fire, tap, wait, detach };
}

describe('attachDoubleTap', () => {
  it('fires on two quick taps in the same place', () => {
    const { onDoubleTap, tap, wait } = setup();
    tap();
    wait(120);
    tap(110, 105);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('a third tap starts a new pair', () => {
    const { onDoubleTap, tap, wait } = setup();
    tap();
    wait(100);
    tap();
    wait(100);
    tap();
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    wait(100);
    tap();
    expect(onDoubleTap).toHaveBeenCalledTimes(2);
  });

  it('ignores taps too far apart in time or space', () => {
    const { onDoubleTap, tap, wait } = setup();
    tap();
    wait(DOUBLE_TAP_GAP_MS + 1);
    tap();
    expect(onDoubleTap).not.toHaveBeenCalled();
    wait(100);
    tap(100 + TAP_SLOP_PX * 2, 100);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('a long press or a drag is not a tap', () => {
    const { onDoubleTap, tap, fire, wait } = setup();
    tap(100, 100, TAP_MAX_MS + 1);
    wait(50);
    tap();
    expect(onDoubleTap).not.toHaveBeenCalled();
    wait(50);
    fire('pointerdown', 100, 100);
    wait(40);
    fire('pointerup', 160, 100);
    wait(50);
    tap();
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('a pinch (two fingers) is not a tap', () => {
    const { onDoubleTap, tap, fire, wait } = setup();
    tap();
    wait(50);
    fire('pointerdown', 100, 100, 1);
    fire('pointerdown', 200, 200, 2);
    wait(40);
    fire('pointerup', 200, 200, 2);
    fire('pointerup', 100, 100, 1);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('ignores the mouse and stops listening once detached', () => {
    const { onDoubleTap, fire, tap, wait, detach } = setup();
    for (let i = 0; i < 2; i += 1) {
      fire('pointerdown', 100, 100, 1, 'mouse');
      fire('pointerup', 100, 100, 1, 'mouse');
    }
    expect(onDoubleTap).not.toHaveBeenCalled();
    detach();
    tap();
    wait(50);
    tap();
    expect(onDoubleTap).not.toHaveBeenCalled();
  });
});
