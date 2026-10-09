'use client';

import { createStarterDocument } from '@roomforge/core';
import { useEffect, useState } from 'react';
import { type OpenedRepository, openProjectRepository } from '@/persistence';
import { ProjectsScreen, translate } from '@/ui';

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
    />
  );
}
