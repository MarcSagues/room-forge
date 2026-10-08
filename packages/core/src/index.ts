/**
 * @roomforge/core — pure TypeScript editor core.
 *
 * Public API. `CORE_PACKAGE_NAME` proves the workspace wiring (web → core). Still to come:
 * commands and serialization (P2-04…P2-05).
 * Constraint (ADR-0001): no React, no three.js, no DOM here.
 */
export const CORE_PACKAGE_NAME = '@roomforge/core' as const;

export * from './domain';
export * from './history';
export * from './ports';
export * from './session';
