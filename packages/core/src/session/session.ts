import { enablePatches, freeze, type Patch, produceWithPatches } from 'immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createNanoIdGen, type DeepReadonly, type IdGen, type SceneDocument } from '../domain';
import { type CatalogProvider, type Clock, systemClock } from '../ports';
import { createEmitter, type Emitter, type SessionEvents } from './events';
import { checkInvariants, touchedByPatches } from './invariants';
import type { Command, CommandContext, CommandError, CommandResult } from './types';

enablePatches();

export interface SessionState {
  readonly document: DeepReadonly<SceneDocument>;
}

/** The store without `setState`: only `execute` writes (ADR-0003). Works with zustand's `useStore`. */
export type ReadonlyStore<T> = Pick<StoreApi<T>, 'getState' | 'getInitialState' | 'subscribe'>;

export interface EditorSessionOptions {
  /** Must already satisfy the invariants (parse imports with `parseSceneDocument` first). */
  initialDocument: SceneDocument;
  catalog: CatalogProvider;
  idGen?: IdGen;
  clock?: Clock;
}

export interface EditorSession {
  readonly store: ReadonlyStore<SessionState>;
  getState(): SessionState;
  /** Calls `listener` only when the selected value changes (`Object.is` unless `equals` is given). */
  subscribe<S>(
    selector: (state: SessionState) => S,
    listener: (value: S, previous: S) => void,
    equals?: (a: S, b: S) => boolean,
  ): () => void;
  /** Applies a command atomically: either every change lands and invariants hold, or nothing does. */
  execute(command: Command): CommandResult;
  on: Emitter<SessionEvents>['on'];
}

export function createEditorSession(options: EditorSessionOptions): EditorSession {
  const ctx: CommandContext = {
    catalog: options.catalog,
    idGen: options.idGen ?? createNanoIdGen(),
    clock: options.clock ?? systemClock,
  };
  const emitter = createEmitter<SessionEvents>();
  // Immer freezes every new version; freezing the first one too keeps all versions immutable.
  const store = createStore<SessionState>()(() => ({
    document: freeze(options.initialDocument, true),
  }));

  function fail(error: CommandError): CommandResult {
    return { ok: false, error };
  }

  function execute(command: Command): CommandResult {
    const base = store.getState().document as SceneDocument;
    let rejection: CommandError | undefined;
    let produced: readonly [SceneDocument, Patch[], Patch[]];
    try {
      produced = produceWithPatches(base, (draft) => {
        // Never return the result from the recipe: Immer would treat it as a replacement document.
        rejection = command.apply(draft, ctx) ?? undefined;
      });
    } catch (thrown) {
      const error: CommandError = {
        code: 'exception',
        message: thrown instanceof Error ? thrown.message : String(thrown),
      };
      emitter.emit('session:error', { error });
      return fail(error);
    }
    if (rejection) return fail(rejection);

    const [next, patches, inverse] = produced;
    if (patches.length === 0) return { ok: true, patches, inverse };

    const violations = checkInvariants(next, ctx.catalog, touchedByPatches(patches));
    if (violations.length > 0) {
      return fail({
        code: 'invariant',
        message: violations.map((v) => `${v.invariant}: ${v.message}`).join('; '),
        violations,
      });
    }

    store.setState({ document: next }, true);
    emitter.emit('document:changed', { patches, source: 'command' });
    return { ok: true, patches, inverse };
  }

  return {
    store,
    getState: store.getState,
    subscribe(selector, listener, equals = Object.is) {
      let current = selector(store.getState());
      return store.subscribe((state) => {
        const next = selector(state);
        if (equals(current, next)) return;
        const previous = current;
        current = next;
        listener(next, previous);
      });
    },
    execute,
    on: emitter.on,
  };
}
