import { createLook, type LightingMode, mixLook, modeLevel, stepLevel } from '@roomforge/core';
import { applyLook, type LookTargets } from './global-lights';

/** What the scene reports about day and night (E2E, and the PNG export later). */
export interface DayNightInfo {
  mode: LightingMode;
  /** 0 is full day, 1 full night; in between while switching. */
  level: number;
  transitioning: boolean;
}

/**
 * Moves the global lighting between day and night (P5-06) by changing values only (see
 * `applyLook`), so switching compiles nothing. `step` runs on every rendered frame and allocates
 * nothing.
 */
export class DayNightDriver {
  private current: number;
  private readonly look = createLook();

  constructor(
    private readonly targets: LookTargets,
    /** 0 jumps straight to the new mode (reduced motion). */
    private readonly durationMs: number,
    mode: LightingMode,
  ) {
    // The scene opens in its mode: no transition on load.
    this.current = modeLevel(mode);
    applyLook(targets, mixLook(this.current, this.look));
  }

  get level(): number {
    return this.current;
  }

  /** Advances towards `mode`; true while it has not arrived (the caller asks for another frame). */
  step(mode: LightingMode, elapsedMs: number): boolean {
    const target = modeLevel(mode);
    if (this.current === target) return false;
    this.current = stepLevel(this.current, target, elapsedMs, this.durationMs);
    applyLook(this.targets, mixLook(this.current, this.look));
    return this.current !== target;
  }
}
