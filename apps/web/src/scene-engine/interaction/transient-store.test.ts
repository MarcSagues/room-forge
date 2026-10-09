import { describe, expect, it, vi } from 'vitest';
import { createTransientStore, type GhostState } from './transient-store';

const ghost: GhostState = {
  x: 1,
  z: 2,
  rotationY: 0.5,
  w: 1.4,
  h: 0.75,
  d: 0.7,
  valid: true,
  visible: true,
  wall: 'west',
  color: '#b08968',
};

describe('transient store: placement ghost', () => {
  it('is empty until a ghost is published, and reuses one object', () => {
    const store = createTransientStore();
    expect(store.ghost()).toBeNull();
    store.publishGhost(ghost);
    const first = store.ghost();
    expect(first).toMatchObject(ghost);
    store.publishGhost({ ...ghost, visible: false, wall: null });
    expect(store.ghost()).toBe(first);
    expect(store.ghost()).toMatchObject({ visible: false, wall: null });
    store.clearGhost();
    expect(store.ghost()).toBeNull();
  });

  it('is not a drag (the camera is not locked by it), and notifies subscribers', () => {
    const store = createTransientStore();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.publishGhost(ghost);
    expect(store.drag()).toBeNull();
    store.clearGhost();
    store.clearGhost(); // nothing to clear: no noise
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    store.publishGhost(ghost);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
