'use client';

import { createStarterDocument } from '@roomforge/core';
import { useEffect, useMemo, useState } from 'react';
import { emptyCatalog } from '@/asset-library';
import {
  downloadFile,
  exportProject,
  type OpenedRepository,
  openProjectRepository,
  readProjectFile,
} from '@/persistence';
import { type ProjectFiles, ProjectsScreen, translate } from '@/ui';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

/**
 * Opens the browser's project storage (IndexedDB, or memory where it is not allowed) and shows the
 * projects screen. Client-only: a static export has no storage to read at build time.
 */
export function ProjectsApp() {
  const [opened, setOpened] = useState<OpenedRepository | undefined>();

  useEffect(() => {
    let cancelled = false;
    openProjectRepository().then((value) => {
      // Strict Mode mounts twice in development: the first attempt's connection is not wanted.
      if (cancelled) void value.close();
      else setOpened(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const files = useMemo<ProjectFiles | undefined>(
    () =>
      opened && {
        exportProject: async (id) =>
          downloadFile(await exportProject(opened.repository, id, { appVersion: APP_VERSION })),
        // Until the real catalog lands (P4-02) every item is unknown, which the preview says.
        readFile: (file) => readProjectFile(file, { catalog: emptyCatalog }),
      },
    [opened],
  );

  if (!opened) {
    return (
      <p role="status" className="grid min-h-dvh place-items-center text-fg-muted">
        {translate('en', 'projects.loading')}
      </p>
    );
  }
  return (
    <ProjectsScreen
      repository={opened.repository}
      storage={opened.mode}
      createDocument={createStarterDocument}
      {...(files ? { files } : {})}
    />
  );
}
