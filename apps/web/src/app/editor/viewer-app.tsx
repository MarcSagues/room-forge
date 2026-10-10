'use client';

import type { SceneDocument } from '@roomforge/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appCatalog } from '@/asset-library';
import type { ErrorLog } from '@/editor';
import { type Autosave, openProjectRepository } from '@/persistence';
import { SharedLinkUnavailable, translate } from '@/ui';
import type { BootedEditor } from './boot-editor';
import { bootViewer, copySharedProject, type ViewerBoot } from './boot-viewer';
import { Workspace } from './editor-app';

/**
 * Composition root of `/view/` (P6-08): the room in the address's fragment, read-only. The
 * fragment is read here and never sent anywhere; a different link pasted in reloads the viewer.
 */
export default function ViewerApp({ errorLog }: { errorLog?: ErrorLog }) {
  const [boot, setBoot] = useState<ViewerBoot>({ phase: 'loading' });
  // Strict Mode runs effects twice in development: the room is opened once.
  const started = useRef<Promise<ViewerBoot> | null>(null);

  useEffect(() => {
    let cancelled = false;
    started.current ??= bootViewer(window.location.hash, {
      catalog: appCatalog,
      untitledName: translate('en', 'projects.untitled'),
    });
    started.current.then((result) => {
      if (!cancelled) setBoot(result);
    });
    const reload = () => window.location.reload();
    window.addEventListener('hashchange', reload);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', reload);
    };
  }, []);

  if (boot.phase === 'loading') {
    return (
      <p role="status" className="grid h-dvh place-items-center text-fg-muted">
        {translate('en', 'viewer.opening')}
      </p>
    );
  }
  if (boot.phase === 'failed') return <SharedLinkUnavailable code={boot.code} />;
  return <SharedWorkspace editor={boot.editor} {...(errorLog ? { errorLog } : {})} />;
}

function SharedWorkspace({ editor, errorLog }: { editor: BootedEditor; errorLog?: ErrorLog }) {
  const autosaveRef = useRef<Autosave | null>(null);
  // The copy is of the room as the link gave it: the viewer cannot change it.
  const copy = useCallback(async () => {
    const id = await copySharedProject(
      {
        name: editor.project.name,
        document: editor.session.getState().document as SceneDocument,
      },
      () => openProjectRepository(),
    );
    window.location.assign(`/editor/?project=${encodeURIComponent(id)}`);
  }, [editor]);
  const viewer = useMemo(() => ({ onCopy: copy }), [copy]);
  const noTakeOver = useCallback(async () => {}, []);
  return (
    <Workspace
      editor={editor}
      autosaveRef={autosaveRef}
      owner={false}
      onTakeOver={noTakeOver}
      viewer={viewer}
      {...(errorLog ? { errorLog } : {})}
    />
  );
}
