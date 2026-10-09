import type { CommandResult } from '@roomforge/core';
import { PerspectiveCamera, type Ray } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlacementApi, type PlacementTarget } from './placement-api';

/** A 200 × 100 canvas at page position (50, 20), looking straight down from 10 m. */
function setup(overWhat: 'canvas' | 'other' = 'canvas') {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () =>
    ({ left: 50, top: 20, width: 200, height: 100, right: 250, bottom: 120 }) as DOMRect;
  const other = document.createElement('div');
  const camera = new PerspectiveCamera(60, 2, 0.1, 100);
  camera.position.set(0, 10, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const frames: (() => void)[] = [];
  const ok = { ok: true } as CommandResult;
  const controller = {
    begin: vi.fn((_id: string) => true),
    update: vi.fn((_ray: Ray | null, _free: boolean) => {}),
    end: vi.fn((): CommandResult | null => ok),
    cancel: vi.fn(),
    placeAtCenter: vi.fn((_id: string, _ray: Ray | null): CommandResult | null => ok),
  } satisfies PlacementTarget;
  let under: Element | null = overWhat === 'canvas' ? canvas : other;
  const api = createPlacementApi({
    controller,
    canvas,
    getCamera: () => camera,
    elementAt: () => under,
    requestFrame: (callback) => frames.push(callback),
    cancelFrame: (handle) => {
      frames[handle - 1] = () => {};
    },
  });
  const flush = () => {
    for (const frame of frames.splice(0)) frame();
  };
  return {
    api,
    controller,
    flush,
    setUnder: (element: Element | null) => (under = element),
    canvas,
    other,
  };
}

let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe('createPlacementApi', () => {
  it('begins a placement and hands the item to the controller', () => {
    expect(ctx.api.begin('desk')).toBe(true);
    expect(ctx.controller.begin).toHaveBeenCalledWith('desk');
    ctx.controller.begin.mockReturnValueOnce(false);
    expect(ctx.api.begin('desk')).toBe(false);
  });

  it('turns the pointer over the canvas into a ray, at most once per frame', () => {
    ctx.api.begin('desk');
    ctx.api.move(150, 70, false); // the centre of the canvas
    ctx.api.move(150, 70, false);
    ctx.api.move(150, 70, true);
    expect(ctx.controller.update).not.toHaveBeenCalled();
    ctx.flush();
    expect(ctx.controller.update).toHaveBeenCalledTimes(1);
    const [ray, free] = ctx.controller.update.mock.calls[0] ?? [];
    expect(free).toBe(true); // the latest position and modifier win
    expect(ray?.origin.y).toBeCloseTo(10);
    expect(ray?.direction.y).toBeCloseTo(-1); // straight down through the centre
    expect(Math.abs(ray?.direction.x ?? 1)).toBeLessThan(1e-6);
  });

  it('a pointer to the right of the centre looks to the right', () => {
    ctx.api.begin('desk');
    ctx.api.move(240, 70, false);
    ctx.flush();
    const [ray] = ctx.controller.update.mock.calls[0] ?? [];
    expect(Math.abs(ray?.direction.x ?? 0)).toBeGreaterThan(0.1);
  });

  it('sends null when the pointer is outside the canvas rectangle', () => {
    ctx.api.begin('desk');
    for (const [x, y] of [
      [10, 70],
      [300, 70],
      [150, 5],
      [150, 200],
    ] as const) {
      ctx.api.move(x, y, false);
      ctx.flush();
      expect(ctx.controller.update).toHaveBeenLastCalledWith(null, false);
    }
  });

  it('sends null when something else is on top of the canvas at the pointer', () => {
    ctx.setUnder(ctx.other);
    ctx.api.begin('desk');
    ctx.api.move(150, 70, false);
    ctx.flush();
    expect(ctx.controller.update).toHaveBeenLastCalledWith(null, false);
  });

  it('drops at the pointer: applies the last position first, reports whether it created something', () => {
    ctx.api.begin('desk');
    ctx.api.move(100, 50, false);
    expect(ctx.api.end(150, 70)).toBe(true);
    // The pending position was replaced by the drop position, in one update, before ending.
    expect(ctx.controller.update).toHaveBeenCalledTimes(1);
    expect(ctx.controller.end).toHaveBeenCalledOnce();
    ctx.flush();
    expect(ctx.controller.update).toHaveBeenCalledTimes(1); // the frame was cancelled

    ctx.controller.end.mockReturnValueOnce(null);
    expect(ctx.api.end(150, 70)).toBe(false);
    ctx.controller.end.mockReturnValueOnce({ ok: false } as CommandResult);
    expect(ctx.api.end(150, 70)).toBe(false);
  });

  it('dropping outside the canvas creates nothing', () => {
    ctx.api.begin('desk');
    ctx.api.end(10, 10);
    expect(ctx.controller.update).toHaveBeenLastCalledWith(null, false);
  });

  it('cancel drops any pending frame and tells the controller', () => {
    ctx.api.begin('desk');
    ctx.api.move(150, 70, false);
    ctx.api.cancel();
    ctx.flush();
    expect(ctx.controller.update).not.toHaveBeenCalled();
    expect(ctx.controller.cancel).toHaveBeenCalledOnce();
  });

  it('places in the middle of the view with the ray through the centre of the canvas', () => {
    expect(ctx.api.placeAtCenter('desk')).toBe(true);
    const [id, ray] = ctx.controller.placeAtCenter.mock.calls[0] ?? [];
    expect(id).toBe('desk');
    expect(ray?.direction.y).toBeCloseTo(-1);
    ctx.controller.placeAtCenter.mockReturnValueOnce(null);
    expect(ctx.api.placeAtCenter('desk')).toBe(false);
  });
});
