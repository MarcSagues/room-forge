'use client';

import { type ReactNode, useCallback, useSyncExternalStore } from 'react';
import type { Autosave, SaveState } from '@/persistence';
import { ProjectStatusProvider, SaveNotice, type SaveProblem } from '@/ui';

const NO_AUTOSAVE: SaveState = { status: 'saved', lastSavedAt: null, error: null, failures: 0 };

/** Where the work stands, re-rendering only the component that asks when autosave changes it. */
export function useSaveState(autosave: Autosave | null): SaveState {
  const subscribe = useCallback(
    (notify: () => void) => (autosave ? autosave.subscribe(() => notify()) : () => {}),
    [autosave],
  );
  const snapshot = useCallback(() => autosave?.state() ?? NO_AUTOSAVE, [autosave]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Gives the top bar the project's name and save state. The subscription lives *here*, not in the
 * editor's root: the state changes a few times after every edit, and a re-render of the root would
 * re-render the panels too, resetting a field that is being edited live (a drag shows the object's
 * position in the properties panel by writing to the DOM, which a re-render would undo).
 * `children` is the same element on every render, so React skips it.
 */
export function SaveStatusBridge(props: {
  autosave: Autosave | null;
  name: string;
  /** Exports the project; turns on the Export menu of the top bar. */
  onExport?: () => void;
  /** Renames the project; turns the name in the top bar into a field. */
  onRename?: ((name: string) => Promise<void>) | undefined;
  children: ReactNode;
}) {
  const save = useSaveState(props.autosave);
  return (
    <ProjectStatusProvider
      name={props.name}
      save={save.status}
      onExport={props.onExport}
      onRename={props.onRename}
    >
      {props.children}
    </ProjectStatusProvider>
  );
}

/** The persistent notice for a save that failed, or for a browser that stores nothing. */
export function SaveNoticeBridge(props: {
  autosave: Autosave | null;
  /** `memory` when the browser stores nothing. */
  storage: 'indexeddb' | 'memory';
  onExport: () => void;
}) {
  const { autosave, storage, onExport } = props;
  const save = useSaveState(autosave);
  const problem: SaveProblem | null =
    storage === 'memory'
      ? { kind: 'memory' }
      : save.status === 'error' && save.error
        ? { kind: 'failed', code: save.error.code }
        : null;
  return (
    <SaveNotice problem={problem} onRetry={() => void autosave?.retry()} onExport={onExport} />
  );
}
