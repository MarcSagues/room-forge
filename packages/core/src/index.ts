/**
 * @roomforge/core — pure TypeScript editor core.
 *
 * Public API. `CORE_PACKAGE_NAME` proves the workspace wiring (web → core). Still to come:
 * the remaining commands.
 * Constraint (ADR-0001): no React, no three.js, no DOM here.
 */
export const CORE_PACKAGE_NAME = '@roomforge/core' as const;

export * from './commands';
export * from './domain';
export * from './geometry';
export * from './history';
export * from './ports';
export * from './serialization';
export * from './session';
export {
  DEFAULT_ROOM_SIZE,
  ROOM_PRESETS,
  type RoomPreset,
  type RoomSize,
} from './session/room-presets';
export { createStarterDocument } from './session/starter-document';
