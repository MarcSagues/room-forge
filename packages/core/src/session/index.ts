export { createEmitter, type Emitter, type SessionEvents, type Unsubscribe } from './events';
export {
  checkInvariants,
  GEOMETRY_TOLERANCE,
  type InvariantId,
  type InvariantScope,
  type InvariantViolation,
  touchedByPatches,
} from './invariants';
export {
  createEditorSession,
  type EditorSession,
  type EditorSessionOptions,
  type Gesture,
  type ReadonlyStore,
  type SessionState,
} from './session';
export type {
  Command,
  CommandContext,
  CommandError,
  CommandErrorCode,
  CommandResult,
} from './types';
