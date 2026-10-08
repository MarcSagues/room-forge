/**
 * @roomforge/core — pure TypeScript editor core.
 *
 * Placeholder export that proves the workspace wiring (web → core). The real
 * public API (domain schemas, EditorSession, commands, history) arrives with
 * P2-01…P2-05. Constraint (ADR-0001): no React, no three.js, no DOM here.
 */
export const CORE_PACKAGE_NAME = '@roomforge/core' as const;

export const broken: number = 'not a number';
