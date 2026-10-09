import { ANGLE_STEPS_DEG, GRID_STEPS } from '../geometry';

export type GridStep = (typeof GRID_STEPS)[number];
export type AngleStepDeg = (typeof ANGLE_STEPS_DEG)[number];

/**
 * How moving and turning objects snap (PRD FR-OBJ-04, FR-UX-03). Off behaves like holding `Alt`:
 * no grid, no wall snap, free turning with the handle. The arrows and `R` still move and turn by
 * one step, so the step sizes apply either way.
 */
export interface SnapSettings {
  readonly enabled: boolean;
  /** Grid size in metres, one of `GRID_STEPS`. */
  readonly gridStep: GridStep;
  /** Turn step in degrees, one of `ANGLE_STEPS_DEG`. */
  readonly angleStepDeg: AngleStepDeg;
}

export const DEFAULT_SNAP: SnapSettings = { enabled: true, gridStep: 0.1, angleStepDeg: 15 };

/** `current` with the valid parts of `change` applied; sizes that are not offered are ignored. */
export function mergeSnap(current: SnapSettings, change: Partial<SnapSettings>): SnapSettings {
  const { enabled, gridStep, angleStepDeg } = change;
  return {
    enabled: typeof enabled === 'boolean' ? enabled : current.enabled,
    gridStep:
      gridStep !== undefined && (GRID_STEPS as readonly number[]).includes(gridStep)
        ? gridStep
        : current.gridStep,
    angleStepDeg:
      angleStepDeg !== undefined && (ANGLE_STEPS_DEG as readonly number[]).includes(angleStepDeg)
        ? angleStepDeg
        : current.angleStepDeg,
  };
}

export function sameSnap(a: SnapSettings, b: SnapSettings): boolean {
  return a.enabled === b.enabled && a.gridStep === b.gridStep && a.angleStepDeg === b.angleStepDeg;
}
