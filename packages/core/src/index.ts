/**
 * @roomforge/core — pure TypeScript editor core.
 *
 * Public API. `CORE_PACKAGE_NAME` proves the workspace wiring (web → core). Still to come:
 * EditorSession, commands, history and serialization (P2-02…P2-05).
 * Constraint (ADR-0001): no React, no three.js, no DOM here.
 */
export const CORE_PACKAGE_NAME = '@roomforge/core' as const;

export * from './domain';
