'use client';

import type { SceneDocument } from '@roomforge/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  SelectionSummary,
  translate,
} from '@/ui';
import type { BootedEditor } from './boot-editor';
import { SaveNoticeBridge, SaveStatusBridge } from './save-bridge';
import { installTestHook } from './test-hook';
import { useEditorBoot } from './use-editor-boot';

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
  if (boot.phase === 'loading') {
    return (
      <p role="status" className="grid h-dvh place-items-center text-fg-muted">
        {translate('en', 'project.opening')}
      </p>
    );
  }
  if (boot.phase === 'failed') return <ProjectUnavailable reason={boot.failure} onRetry={retry} />;
  return <Workspace editor={boot.editor} {...(errorLog ? { errorLog } : {})} />;
}

function Workspace({ editor, errorLog }: { editor: BootedEditor; errorLog?: ErrorLog }) {
  const { session, project, repository, storage, journal } = editor;
  const [context, setContext] = useState<ContextState>('ok');
  const scene = useRef<SceneHandle | null>(null);
  const autosaveRef = useRef<Autosave | null>(null);
  // Set once autosave is running. The save state is NOT read here: see SaveStatusBridge.
  const [autosave, setAutosave] = useState<Autosave | null>(null);

  useEffect(
    () =>
      installTestHook(window, {
        session,
        getScene: () => scene.current,
        getAutosave: () => autosaveRef.current,
      }),
    [session],
  );

  // Autosave lives as long as the editor does: it listens to the session, and when the editor goes
  // away (or the page does) whatever is pending is written first.
  useEffect(() => {
    const instance = createAutosave({
      repository,
      projectId: project.id,
      name: () => project.name,
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
  }, [repository, project.id, project.name, session, journal]);

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
    downloadFile(exportFileOf({ name: project.name, document }, { appVersion: APP_VERSION }));
  }, [session, project.name]);

  return (
    <SaveStatusBridge autosave={autosave} name={project.name} onExport={exportCopy}>
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
        properties={<SelectionSummary session={session} catalog={stubCatalog} live={live} />}
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
          </>
        }
      />
    </SaveStatusBridge>
  );
}
