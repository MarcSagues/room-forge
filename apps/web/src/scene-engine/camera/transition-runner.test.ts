import { describe, expect, it } from 'vitest';
import { TRANSITION_MS, type ViewState } from './transition';
import { createTransitionRunner } from './transition-runner';

const view = (x: number, zoom = 1): ViewState => ({
  position: [x, 5, 5],
  target: [0, 0, 0],
  zoom,
});

const blank = (): ViewState => view(0);

describe('createTransitionRunner', () => {
  it('is idle until started and reports nothing to do', () => {
    const runner = createTransitionRunner();
    expect(runner.active).toBe(false);
    expect(runner.step(0, blank())).toBe(false);
  });

  it('writes the start view at t = 0 and stays active', () => {
    const runner = createTransitionRunner();
    const out = blank();
    runner.start(view(2), view(8), 1000);
    expect(runner.active).toBe(true);
    expect(runner.step(1000, out)).toBe(false);
    expect(out.position[0]).toBeCloseTo(2, 10);
  });

  it('passes through intermediate views with easing', () => {
    const runner = createTransitionRunner();
    const out = blank();
    runner.start(view(0), view(10), 0, 400);
    runner.step(200, out);
    expect(out.position[0]).toBeGreaterThan(0);
    expect(out.position[0]).toBeLessThan(10);
  });

  it('lands exactly on the destination and deactivates on the last step', () => {
    const runner = createTransitionRunner();
    const out = blank();
    runner.start(view(0, 1), view(10, 8), 0);
    expect(runner.step(TRANSITION_MS, out)).toBe(true);
    expect(out.position).toEqual([10, 5, 5]);
    expect(out.zoom).toBe(8);
    expect(runner.active).toBe(false);
  });

  it('finishes late frames at the destination instead of overshooting', () => {
    const runner = createTransitionRunner();
    const out = blank();
    runner.start(view(0), view(10), 0);
    expect(runner.step(TRANSITION_MS * 5, out)).toBe(true);
    expect(out.position[0]).toBe(10);
  });

  it('completes on the first step when the duration is zero (reduced motion)', () => {
    const runner = createTransitionRunner();
    const out = blank();
    runner.start(view(0), view(10), 500, 0);
    expect(runner.step(500, out)).toBe(true);
    expect(out.position[0]).toBe(10);
  });

  it('does not alias the views it was given', () => {
    const runner = createTransitionRunner();
    const from = view(0);
    const to = view(10);
    const out = blank();
    runner.start(from, to, 0);
    to.position[0] = 999;
    from.position[0] = -999;
    runner.step(TRANSITION_MS, out);
    expect(out.position[0]).toBe(10);
  });

  it('can be cancelled and restarted', () => {
    const runner = createTransitionRunner();
    const out = blank();
    runner.start(view(0), view(10), 0);
    runner.cancel();
    expect(runner.active).toBe(false);
    expect(runner.step(100, out)).toBe(false);
    runner.start(view(0), view(4), 1000);
    expect(runner.step(1000 + TRANSITION_MS, out)).toBe(true);
    expect(out.position[0]).toBe(4);
  });
});
