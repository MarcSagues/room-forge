'use client';

import { nextWallMode, type SceneDocument } from '@roomforge/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyCatalog } from '@/asset-library';
import { installHotkeys } from '@/editor';
import {
  type Autosave,
  autosaveSourceOf,
  createAutosave,
  downloadFile,
  exportFileOf,
  installAutosaveLifecycle,
} from '@/persistence';
import { SceneCanvas, type SceneHandle } from '@/scene-engine';
import { EditorShell, ProjectUnavailable, SelectionSummary, translate } from '@/ui';
import type { BootedEditor } from './boot-editor';
import { SaveNoticeBridge, SaveStatusBridge } from './save-bridge';
import { installTestHook } from './test-hook';
import { useEditorBoot } from './use-editor-boot';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

/**
 * Composition root of the editor route (client-only, loaded by the loader): opens the project to
 * edit (the one in the address, the last one, or a new one), then shows the editor on it with
 * autosave running. If the project cannot be opened it says why and leads back to the projects.
 */
export default function EditorApp() {
  const { boot, retry } = useEditorBoot();
  if (boot.phase === 'loading') {
    return (
      <p role="status" className="grid h-dvh place-items-center text-fg-muted">
        {translate('en', 'project.opening')}
      </p>
    );
  }
  if (boot.phase === 'failed') return <ProjectUnavailable reason={boot.failure} onRetry={retry} />;
  return <Workspace editor={boot.editor} />;
}

function Workspace({ editor }: { editor: BootedEditor }) {
  const { session, project, repository, storage, journal } = editor;
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

  useEffect(
    () =>
      installHotkeys(window, {
        setView: (view) => session.setView(view),
        fit: () => scene.current?.camera.fit(),
        cycleWalls: () => session.setWallMode(nextWallMode(session.getState().wallMode)),
        toggleCeiling: () => session.setShowCeiling(!session.getState().showCeiling),
        deselect: () => session.select([]),
      }),
    [session],
  );

  // A copy of what is on screen, not of what was last written: when saving fails, the work is here.
  const exportCopy = useCallback(() => {
    const document = session.getState().document as SceneDocument;
    downloadFile(exportFileOf({ name: project.name, document }, { appVersion: APP_VERSION }));
  }, [session, project.name]);

  return (
    <SaveStatusBridge autosave={autosave} name={project.name}>
      <EditorShell
        properties={<SelectionSummary session={session} />}
        viewport={
          <>
            <SceneCanvas
              session={session}
              catalog={emptyCatalog}
              onReady={(handle) => {
                scene.current = handle;
              }}
            />
            <SaveNoticeBridge autosave={autosave} storage={storage} onExport={exportCopy} />
          </>
        }
      />
    </SaveStatusBridge>
  );
}
