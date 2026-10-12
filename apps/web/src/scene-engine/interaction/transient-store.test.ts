import type { RoomId } from '@roomforge/core';
import { describe, expect, it, vi } from 'vitest';
import { createTransientStore, type GhostState, type OpeningDragState } from './transient-store';

const ghost: GhostState = {
  x: 1,
  y: 0.75,
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

describe('transient store: an opening being dragged', () => {
  const opening: OpeningDragState = {
    id: null,
    roomId: 'room-1' as RoomId,
    wall: 'north',
    kind: 'window',
    variant: 'window.standard',
    offset: 1,
    width: 1,
    height: 1.2,
    sill: 0.9,
    valid: true,
    visible: true,
  };

  it('is empty until published, reuses one object and notifies on clear once', () => {
    const store = createTransientStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.opening()).toBeNull();
    store.publishOpening(opening);
    const first = store.opening();
    expect(first).toMatchObject(opening);
    store.publishOpening({ ...opening, offset: 2, valid: false });
    expect(store.opening()).toBe(first);
    expect(store.opening()).toMatchObject({ offset: 2, valid: false });
    expect(store.drag()).toBeNull();
    store.clearOpening();
    store.clearOpening();
    expect(store.opening()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
