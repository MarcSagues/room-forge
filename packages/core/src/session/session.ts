import { applyPatches, enablePatches, freeze, type Patch, produceWithPatches } from 'immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createNanoIdGen, type DeepReadonly, type IdGen, type SceneDocument } from '../domain';
import { createHistory, type HistoryStatus } from '../history';
import { type CatalogProvider, type Clock, systemClock } from '../ports';
import { createEmitter, type Emitter, type SessionEvents } from './events';
import { checkInvariants, touchedByPatches } from './invariants';
import {
  type EntityId,
  entityExists,
  nextSelection,
  reconcileSelection,
  type SelectionMode,
  sameIds,
  type ToolId,
} from './selection';
import type { Command, CommandContext, CommandError, CommandResult } from './types';
import type { ViewMode } from './view';

enablePatches();

/**
 * Everything the editor shows. `document` is undoable; `history` mirrors the undo stack; selection,
 * hover, tool and view are session-only state (never in the history, never persisted).
 */
export interface SessionState {
  readonly document: DeepReadonly<SceneDocument>;
  readonly history: HistoryStatus;
  readonly selection: readonly EntityId[];
  readonly hover: EntityId | null;
  readonly activeTool: ToolId;
  readonly view: ViewMode;
}

/** The store without `setState`: only the session writes (ADR-0003). Works with zustand's `useStore`. */
export type ReadonlyStore<T> = Pick<StoreApi<T>, 'getState' | 'getInitialState' | 'subscribe'>;

export interface EditorSessionOptions {
  /** Must already satisfy the invariants (parse imports with `parseSceneDocument` first). */
  initialDocument: SceneDocument;
  catalog: CatalogProvider;
  idGen?: IdGen;
  clock?: Clock;
  /** Maximum undo entries (default 200). */
  historyLimit?: number;
  /** Coalescing window for commands with the same `mergeKey` (default 600 ms). */
  mergeWindowMs?: number;
}

/**
 * Groups several commands into one history entry (e.g. "Place desk kit"). While a gesture is open,
 * commands build on a working copy; the store and listeners only see the result on `commit`.
 */
export interface Gesture {
  readonly label: string;
  /** Publishes the accumulated changes as one entry and one `document:changed`. */
  commit(): CommandResult;
  /** Discards the accumulated changes; nothing is published or recorded. */
  cancel(): void;
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
  /** Returns false when there is nothing to undo or a gesture is open. */
  undo(): boolean;
  redo(): boolean;
  /** Throws if a gesture is already open (one at a time). */
  beginGesture(label: string): Gesture;
  /** Ids that do not exist are ignored. Emits `selection:changed` when the selection changes. */
  select(ids: readonly EntityId[], mode?: SelectionMode): void;
  setHover(id: EntityId | null): void;
  setActiveTool(tool: ToolId): void;
  /** Emits `view:changed` when the view changes. Not undoable. */
  setView(view: ViewMode): void;
  on: Emitter<SessionEvents>['on'];
}

type Applied =
  | { ok: true; next: SceneDocument; patches: Patch[]; inverse: Patch[] }
  | { ok: false; error: CommandError };

interface OpenGesture {
  label: string;
  document: SceneDocument;
  patches: Patch[];
  inverse: Patch[];
}

export function createEditorSession(options: EditorSessionOptions): EditorSession {
  const ctx: CommandContext = {
    catalog: options.catalog,
    idGen: options.idGen ?? createNanoIdGen(),
    clock: options.clock ?? systemClock,
  };
  const history = createHistory({
    clock: ctx.clock,
    ...(options.historyLimit === undefined ? {} : { limit: options.historyLimit }),
    ...(options.mergeWindowMs === undefined ? {} : { mergeWindowMs: options.mergeWindowMs }),
  });
  const emitter = createEmitter<SessionEvents>();
  // Immer freezes every new version; freezing the first one too keeps all versions immutable.
  const store = createStore<SessionState>()(() => ({
    document: freeze(options.initialDocument, true),
    history: history.status(),
    selection: [],
    hover: null,
    activeTool: 'select',
    view: 'perspective',
  }));
  let gesture: OpenGesture | undefined;

  const current = () => store.getState().document as SceneDocument;

  /** Runs a command against `base` and checks invariants, without publishing anything. */
  function apply(command: Command, base: SceneDocument): Applied {
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
      return { ok: false, error };
    }
    if (rejection) return { ok: false, error: rejection };

    const [next, patches, inverse] = produced;
    if (patches.length > 0) {
      const violations = checkInvariants(next, ctx.catalog, touchedByPatches(patches));
      if (violations.length > 0) {
        const message = violations.map((v) => `${v.invariant}: ${v.message}`).join('; ');
        return { ok: false, error: { code: 'invariant', message, violations } };
      }
    }
    return { ok: true, next, patches, inverse };
  }

  /** One store update, then the events, so listeners see a consistent state. */
  function publish(
    document: SceneDocument,
    patches: readonly Patch[],
    source: SessionEvents['document:changed']['source'],
  ) {
    const previous = store.getState();
    const status = history.status();
    const selection = reconcileSelection(document, previous.selection);
    const hover =
      previous.hover !== null && entityExists(document, previous.hover) ? previous.hover : null;
    store.setState({ ...previous, document, history: status, selection, hover }, true);
    // Documented order: document, then history, then selection (ARCHITECTURE §5).
    emitter.emit('document:changed', { patches, source });
    if (!sameStatus(previous.history, status)) emitter.emit('history:changed', status);
    if (selection !== previous.selection) emitter.emit('selection:changed', { ids: selection });
  }

  function select(ids: readonly EntityId[], mode: SelectionMode = 'replace') {
    const state = store.getState();
    const selection = nextSelection(state.document, state.selection, ids, mode);
    if (sameIds(selection, state.selection)) return;
    store.setState({ selection });
    emitter.emit('selection:changed', { ids: selection });
  }

  function execute(command: Command): CommandResult {
    const result = apply(command, gesture ? gesture.document : current());
    if (!result.ok) return result;
    const { next, patches, inverse } = result;
    if (patches.length === 0) return { ok: true, patches, inverse };

    if (gesture) {
      gesture.document = next;
      gesture.patches.push(...patches);
      gesture.inverse = [...inverse, ...gesture.inverse];
    } else {
      history.push({
        label: command.label,
        patches,
        inverse,
        ...(command.mergeKey === undefined ? {} : { mergeKey: command.mergeKey }),
      });
      publish(next, patches, 'command');
    }
    return { ok: true, patches, inverse };
  }

  function travel(direction: 'undo' | 'redo'): boolean {
    if (gesture) return false;
    const entry = direction === 'undo' ? history.undo() : history.redo();
    if (!entry) return false;
    const patches = direction === 'undo' ? entry.inverse : entry.patches;
    publish(applyPatches(current(), patches as Patch[]), patches, direction);
    return true;
  }

  function beginGesture(label: string): Gesture {
    if (gesture) throw new Error(`A gesture is already open ("${gesture.label}")`);
    const open: OpenGesture = { label, document: current(), patches: [], inverse: [] };
    gesture = open;
    emitter.emit('gesture:started', { label });

    const close = (committed: boolean) => {
      if (gesture !== open) throw new Error(`Gesture "${label}" is no longer open`);
      gesture = undefined;
      emitter.emit('gesture:ended', { label, committed });
    };

    return {
      label,
      commit() {
        close(true);
        const { document, patches, inverse } = open;
        if (patches.length > 0) {
          history.push({ label, patches, inverse });
          publish(document, patches, 'command');
        }
        return { ok: true, patches, inverse };
      },
      cancel() {
        close(false);
      },
    };
  }

  return {
    store,
    getState: store.getState,
    subscribe(selector, listener, equals = Object.is) {
      let selected = selector(store.getState());
      return store.subscribe((state) => {
        const next = selector(state);
        if (equals(selected, next)) return;
        const previous = selected;
        selected = next;
        listener(next, previous);
      });
    },
    execute,
    undo: () => travel('undo'),
    redo: () => travel('redo'),
    beginGesture,
    select,
    setHover(id) {
      const state = store.getState();
      const hover = id !== null && entityExists(state.document, id) ? id : null;
      if (hover !== state.hover) store.setState({ hover });
    },
    setActiveTool(tool) {
      if (tool !== store.getState().activeTool) store.setState({ activeTool: tool });
    },
    setView(view) {
      if (view === store.getState().view) return;
      store.setState({ view });
      emitter.emit('view:changed', { view });
    },
    on: emitter.on,
  };
}

function sameStatus(a: HistoryStatus, b: HistoryStatus): boolean {
  return (
    a.canUndo === b.canUndo &&
    a.canRedo === b.canRedo &&
    a.undoLabel === b.undoLabel &&
    a.redoLabel === b.redoLabel
  );
}
