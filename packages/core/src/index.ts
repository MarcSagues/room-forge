/**
 * @roomforge/core — pure TypeScript editor core.
 *
 * Public API. `CORE_PACKAGE_NAME` proves the workspace wiring (web → core). Still to come:
 * the remaining commands and serialization.
 * Constraint (ADR-0001): no React, no three.js, no DOM here.
 */
export const CORE_PACKAGE_NAME = '@roomforge/core' as const;

export * from './commands';
export * from './domain';
export * from './geometry';
export * from './history';
export * from './materials';
export * from './ports';
export * from './session';
