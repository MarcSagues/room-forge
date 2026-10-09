'use client';

import type { SceneDocument } from '@roomforge/core';
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { catalogEntries, stubCatalog } from '@/asset-library';
import { createShortcutRegistry, type ErrorLog, editorShortcuts } from '@/editor';
import {
  type Autosave,
  autosaveSourceOf,
  createAutosave,
  downloadFile,
  exportFileOf,
  installAutosaveLifecycle,
} from '@/persistence';
import { type LiveTransform, SceneCanvas, type SceneHandle } from '@/scene-engine';
import {
  CatalogPanel,
  type CatalogPanelItem,
  ContextNotice,
  type ContextState,
  EditorShell,
  ProjectUnavailable,
  ReadOnlyNotice,
  RoomMaterialsPanel,
  RoomSizePanel,
  SelectionSummary,
  translate,
} from '@/ui';
import type { BootedEditor } from './boot-editor';
import { SaveNoticeBridge, SaveStatusBridge } from './save-bridge';
import { installTestHook } from './test-hook';
import { useEditorBoot } from './use-editor-boot';
import { useProjectLock } from './use-project-lock';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

/** What the catalog panel lists: the stub manifest until the real catalog arrives (P4-06). */
const CATALOG_ITEMS: readonly CatalogPanelItem[] = catalogEntries().map((entry) => ({
  id: entry.id,
  name: entry.name.en,
  color: entry.color,
  size: entry.size,
}));

/**
 * Composition root of the editor route (client-only, loaded by the loader): opens the project to
 * edit (the one in the address, the last one, or a new one), then shows the editor on it with
 * autosave running. If the project cannot be opened it says why and leads back to the projects.
 */
export default function EditorApp({ errorLog }: { errorLog?: ErrorLog }) {
  const { boot, retry } = useEditorBoot();
  if (boot.phase === 'loading') return <Opening />;
  if (boot.phase === 'failed') return <ProjectUnavailable reason={boot.failure} onRetry={retry} />;
  return <LockedWorkspace editor={boot.editor} {...(errorLog ? { errorLog } : {})} />;
}

function Opening() {
  return (
    <p role="status" className="grid h-dvh place-items-center text-fg-muted">
      {translate('en', 'project.opening')}
    </p>
  );
}

/** Opens the project again from storage, by its id: another tab may have changed it. */
function reopen(projectId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('project', projectId);
  window.location.replace(url.toString());
}

/**
 * One editing tab per project (P6-09): this tab edits only while it owns the project. Otherwise
 * the session is read-only, autosave does not run, and a notice offers to take over; taking over
 * makes the owner write what it has and turn read-only, then this tab reopens the project.
 */
function LockedWorkspace({ editor, errorLog }: { editor: BootedEditor; errorLog?: ErrorLog }) {
  const { session, project, storage } = editor;
  const autosaveRef = useRef<Autosave | null>(null);
  const handover = useCallback(async () => {
    session.setReadOnly(true);
    await autosaveRef.current?.flush();
  }, [session]);
  const { role, takeOver } = useProjectLock(storage === 'indexeddb' ? project.id : null, handover);
  useLayoutEffect(() => session.setReadOnly(role !== 'owner'), [session, role]);
  const takeOverAndReopen = useCallback(async () => {
    await takeOver();
    reopen(project.id);
  }, [takeOver, project.id]);

  if (role === 'pending') return <Opening />;
  return (
    <Workspace
      editor={editor}
      autosaveRef={autosaveRef}
      owner={role === 'owner'}
      onTakeOver={takeOverAndReopen}
      {...(errorLog ? { errorLog } : {})}
    />
  );
}

function Workspace(props: {
  editor: BootedEditor;
  autosaveRef: RefObject<Autosave | null>;
  /** Another tab owns the project: nothing is saved here, and a notice offers to take over. */
  owner: boolean;
  onTakeOver: () => Promise<void>;
  errorLog?: ErrorLog;
}) {
  const { editor, autosaveRef, owner, onTakeOver, errorLog } = props;
  const { session, project, repository, storage, journal } = editor;
  const [context, setContext] = useState<ContextState>('ok');
  const scene = useRef<SceneHandle | null>(null);
  // Set once autosave is running. The save state is NOT read here: see SaveStatusBridge.
  const [autosave, setAutosave] = useState<Autosave | null>(null);
  // The name can change while the editor is open (renamed from the top bar). Autosave and the
  // export read the ref, so renaming does not restart autosave.
  const [name, setName] = useState(project.name);
  const nameRef = useRef(project.name);

  useEffect(
    () =>
      installTestHook(window, {
        session,
        getScene: () => scene.current,
        getAutosave: () => autosaveRef.current,
      }),
    [session, autosaveRef],
  );

  // Autosave lives as long as the editor does: it listens to the session, and when the editor goes
  // away (or the page does) whatever is pending is written first. A read-only tab saves nothing.
  useEffect(() => {
    if (!owner) return;
    const instance = createAutosave({
      repository,
      projectId: project.id,
      name: () => nameRef.current,
      source: autosaveSourceOf(session),
      ...(journal ? { journal } : {}),
    });
    const removeLifecycle = installAutosaveLifecycle(instance, window);
    autosaveRef.current = instance;
    setAutosave(instance);
    return () => {
      removeLifecycle();
      autosaveRef.current = null;
      setAutosave(null);
      void instance.dispose({ flush: true });
    };
  }, [repository, project.id, session, journal, owner, autosaveRef]);

  // The shortcuts are data: the editor's own go in here, the shell adds the panels and the help.
  const shortcuts = useMemo(() => {
    const registry = createShortcutRegistry();
    registry.registerAll(editorShortcuts({ session, fit: () => scene.current?.camera.fit() }));
    return registry;
  }, [session]);

  // The panel and the scene only meet here: the scene may not be mounted yet, so each call looks
  // it up when it happens.
  const placement = useMemo(
    () => ({
      begin: (id: string) => scene.current?.placement.begin(id) ?? false,
      move: (x: number, y: number, free: boolean) => scene.current?.placement.move(x, y, free),
      end: (x: number, y: number) => scene.current?.placement.end(x, y) ?? false,
      cancel: () => scene.current?.placement.cancel(),
    }),
    [],
  );
  // The properties panel follows a drag in the scene through this.
  const live = useMemo<LiveTransform>(
    () => ({
      read: () => scene.current?.live.read() ?? null,
      subscribe: (listener) => scene.current?.live.subscribe(listener) ?? (() => {}),
    }),
    [],
  );

  // After a lost context the scene is redrawn from the session (which lives outside the canvas),
  // so the notice only has to say so, and then goes away on its own.
  useEffect(() => {
    if (context !== 'restored') return;
    const timer = setTimeout(() => setContext('ok'), 2500);
    return () => clearTimeout(timer);
  }, [context]);

  // A copy of what is on screen, not of what was last written: when saving fails, the work is here.
  const exportCopy = useCallback(() => {
    const document = session.getState().document as SceneDocument;
    downloadFile(exportFileOf({ name: nameRef.current, document }, { appVersion: APP_VERSION }));
  }, [session]);

  // The next autosave already writes the new name; if renaming fails it goes back to the old one.
  const rename = useCallback(
    async (next: string) => {
      const previous = nameRef.current;
      nameRef.current = next;
      try {
        const renamed = await repository.rename(project.id, next);
        nameRef.current = renamed.name;
        setName(renamed.name);
      } catch (error) {
        nameRef.current = previous;
        throw error;
      }
    },
    [repository, project.id],
  );

  return (
    <SaveStatusBridge
      autosave={autosave}
      name={name}
      onExport={exportCopy}
      onRename={owner ? rename : undefined}
    >
      <EditorShell
        session={session}
        shortcuts={shortcuts}
        catalog={
          <CatalogPanel
            items={CATALOG_ITEMS}
            placement={placement}
            onPlace={(id) => scene.current?.placement.placeAtCenter(id) ?? false}
          />
        }
        onPanelError={(error, panel) => errorLog?.record(error, { source: 'react', where: panel })}
        properties={
          <>
            <SelectionSummary session={session} catalog={stubCatalog} live={live} />
            <RoomSizePanel session={session} />
            <RoomMaterialsPanel session={session} />
          </>
        }
        viewport={
          <>
            <SceneCanvas
              session={session}
              catalog={stubCatalog}
              onReady={(handle) => {
                scene.current = handle;
              }}
              onContextLost={() => {
                setContext('lost');
                errorLog?.record('The WebGL context was lost', {
                  source: 'webgl',
                  where: 'Viewport',
                });
              }}
              onContextRestored={() => setContext('restored')}
            />
            <ContextNotice state={context} />
            <SaveNoticeBridge autosave={autosave} storage={storage} onExport={exportCopy} />
            {owner ? null : <ReadOnlyNotice onTakeOver={onTakeOver} />}
          </>
        }
      />
    </SaveStatusBridge>
  );
}
