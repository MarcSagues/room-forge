import { blendView, easeInOutCubic, TRANSITION_MS, type ViewState } from './transition';

export interface TransitionRunner {
  readonly active: boolean;
  /** Copies both views, so the caller may reuse its own objects. A zero duration jumps at once. */
  start(from: ViewState, to: ViewState, now: number, durationMs?: number): void;
  /**
   * Writes the view for `now` into `out` (no allocations). Returns true on the step that lands on
   * the destination, after which the runner is idle again.
   */
  step(now: number, out: ViewState): boolean;
  cancel(): void;
}

const copyInto = (target: ViewState, source: ViewState) => {
  target.position[0] = source.position[0];
  target.position[1] = source.position[1];
  target.position[2] = source.position[2];
  target.target[0] = source.target[0];
  target.target[1] = source.target[1];
  target.target[2] = source.target[2];
  target.zoom = source.zoom;
};

const emptyView = (): ViewState => ({ position: [0, 0, 0], target: [0, 0, 0], zoom: 1 });

/** Time-based tween between two camera views, driven by whoever owns the frame loop. */
export function createTransitionRunner(): TransitionRunner {
  const from = emptyView();
  const to = emptyView();
  let startedAt = 0;
  let duration = TRANSITION_MS;
  let active = false;

  return {
    get active() {
      return active;
    },
    start(origin, destination, now, durationMs = TRANSITION_MS) {
      copyInto(from, origin);
      copyInto(to, destination);
      startedAt = now;
      duration = Math.max(0, durationMs);
      active = true;
    },
    step(now, out) {
      if (!active) return false;
      const progress = duration === 0 ? 1 : (now - startedAt) / duration;
      if (progress >= 1) {
        copyInto(out, to);
        active = false;
        return true;
      }
      blendView(from, to, easeInOutCubic(progress), out);
      return false;
    },
    cancel() {
      active = false;
    },
  };
}
