import { describe, expect, it } from 'vitest';
import {
  blendView,
  easeInOutCubic,
  TRANSITION_MS,
  type ViewState,
  viewFromPose,
} from './transition';

const state = (position: [number, number, number], target: [number, number, number], zoom = 1) =>
  ({ position, target, zoom }) satisfies ViewState;

const distance = (view: ViewState) =>
  Math.hypot(
    view.position[0] - view.target[0],
    view.position[1] - view.target[1],
    view.position[2] - view.target[2],
  );

describe('easeInOutCubic', () => {
  it('starts at 0, ends at 1 and is symmetric', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(0.2) + easeInOutCubic(0.8)).toBeCloseTo(1, 12);
  });

  it('is monotonic and clamps out-of-range input', () => {
    let previous = -1;
    for (let step = 0; step <= 20; step += 1) {
      const value = easeInOutCubic(step / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(easeInOutCubic(-3)).toBe(0);
    expect(easeInOutCubic(9)).toBe(1);
  });
});

describe('TRANSITION_MS', () => {
  it('stays within the 600 ms budget of the view switch', () => {
    expect(TRANSITION_MS).toBeLessThanOrEqual(600);
    expect(TRANSITION_MS).toBeGreaterThan(0);
  });
});

describe('blendView', () => {
  const from = state([6, 5, 6], [0, 0, 0]);
  const to = state([0, 10, 0.001], [0, 0, 0], 4);
  const out = state([0, 0, 0], [0, 0, 0]);

  it('returns the endpoints at t = 0 and t = 1', () => {
    blendView(from, to, 0, out);
    expect(out.position[0]).toBeCloseTo(6, 10);
    expect(out.position[1]).toBeCloseTo(5, 10);
    expect(out.zoom).toBeCloseTo(1, 10);
    blendView(from, to, 1, out);
    expect(out.position[1]).toBeCloseTo(10, 10);
    expect(out.position[2]).toBeCloseTo(0.001, 10);
    expect(out.zoom).toBeCloseTo(4, 10);
  });

  it('orbits instead of cutting through the target', () => {
    const a = state([5, 0, 0], [0, 0, 0]);
    const b = state([-5, 0, 0], [0, 0, 0]);
    blendView(a, b, 0.5, out);
    // A straight line would pass through the target (distance 0); an orbit keeps the radius.
    expect(distance(out)).toBeGreaterThan(4);
  });

  it('turns the short way round the azimuth', () => {
    const a = state([Math.sin(0.1 * Math.PI) * 4, 2, Math.cos(0.1 * Math.PI) * 4], [0, 0, 0]);
    const b = state([Math.sin(-0.1 * Math.PI) * 4, 2, Math.cos(-0.1 * Math.PI) * 4], [0, 0, 0]);
    blendView(a, b, 0.5, out);
    expect(Math.atan2(out.position[0], out.position[2])).toBeCloseTo(0, 10);
  });

  it('interpolates the zoom geometrically', () => {
    blendView(state([0, 1, 1], [0, 0, 0], 1), state([0, 1, 1], [0, 0, 0], 16), 0.5, out);
    expect(out.zoom).toBeCloseTo(4, 10);
  });

  it('moves the target linearly', () => {
    blendView(state([0, 3, 3], [0, 0, 0]), state([4, 3, 3], [4, 2, 0]), 0.5, out);
    expect(out.target).toEqual([2, 1, 0]);
  });

  it('writes into `out` without allocating new arrays', () => {
    const position = out.position;
    const target = out.target;
    blendView(from, to, 0.3, out);
    expect(out.position).toBe(position);
    expect(out.target).toBe(target);
  });
});

describe('viewFromPose', () => {
  it('copies a pose into a mutable state with the given zoom', () => {
    const view = viewFromPose({ position: [1, 2, 3], target: [0, 1, 0] }, 7);
    expect(view).toEqual({ position: [1, 2, 3], target: [0, 1, 0], zoom: 7 });
  });
});
