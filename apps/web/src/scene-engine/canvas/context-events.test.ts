import { describe, expect, it, vi } from 'vitest';
import { watchContext } from './context-events';

function lostEvent() {
  return new Event('webglcontextlost', { cancelable: true });
}

describe('watchContext', () => {
  it('prevents the default on loss (so the browser can restore) and notifies', () => {
    const canvas = document.createElement('canvas');
    const onLost = vi.fn();
    watchContext(canvas, { onLost });
    const event = lostEvent();
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledOnce();
  });

  it('notifies when the context is restored', () => {
    const canvas = document.createElement('canvas');
    const onRestored = vi.fn();
    watchContext(canvas, { onRestored });
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(onRestored).toHaveBeenCalledOnce();
  });

  it('works without handlers and stops listening after cleanup', () => {
    const canvas = document.createElement('canvas');
    const onLost = vi.fn();
    const stop = watchContext(canvas, { onLost });
    stop();
    const event = lostEvent();
    canvas.dispatchEvent(event);
    expect(onLost).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(() => watchContext(canvas, {})()).not.toThrow();
  });
});
