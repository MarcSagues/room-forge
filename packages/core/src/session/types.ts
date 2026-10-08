import type { Draft, Patch } from 'immer';
import type { IdGen, SceneDocument } from '../domain';
import type { CatalogProvider, Clock } from '../ports';
import type { InvariantViolation } from './invariants';

/** What a command may use besides the draft: injected so commands stay pure and testable. */
export interface CommandContext {
  readonly idGen: IdGen;
  readonly clock: Clock;
  readonly catalog: CatalogProvider;
}

export type CommandErrorCode = 'invariant' | 'conflict' | 'not-found' | 'invalid' | 'exception';

export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
  readonly violations?: readonly InvariantViolation[];
  /** Entities that block the command (e.g. objects a smaller room would leave outside). */
  readonly conflicts?: readonly string[];
}

/**
 * The only way to change the document (ADR-0003). `apply` mutates an Immer draft; returning a
 * `CommandError` aborts the command and discards every change it made.
 */
export interface Command {
  /** Stable name, e.g. `object/move`. */
  readonly type: string;
  /** Shown in the history, e.g. "Move desk". */
  readonly label: string;
  /** Consecutive commands with the same key are coalesced by the history (P2-03). */
  readonly mergeKey?: string;
  apply(draft: Draft<SceneDocument>, ctx: CommandContext): CommandError | undefined | void;
}

export type CommandResult =
  | { readonly ok: true; readonly patches: Patch[]; readonly inverse: Patch[] }
  | { readonly ok: false; readonly error: CommandError };
