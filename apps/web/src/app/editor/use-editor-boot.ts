'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { stubCatalog } from '@/asset-library';
import {
  createLocalStorageJournal,
  type KeyValueStorage,
  openProjectRepository,
} from '@/persistence';
import { translate } from '@/ui';
import { type Boot, bootEditor } from './boot-editor';

/** The browser's `localStorage`, or nothing where site data is blocked. */
export function browserStorage(): KeyValueStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Opens the project the editor starts with, once per visit. React Strict Mode runs effects twice in
 * development; the boot is started from a ref, so the second run reuses the first instead of
 * opening (and, with nothing stored, creating) a second project.
 */
export function useEditorBoot(): { boot: Boot; retry: () => void } {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const started = useRef<{ attempt: number; promise: Promise<Boot> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (started.current?.attempt !== attempt) {
      started.current = {
        attempt,
        promise: bootEditor({
          openRepository: () => openProjectRepository(),
          search: window.location.search,
          storage: browserStorage(),
          journal: createLocalStorageJournal(browserStorage()),
          catalog: stubCatalog,
          untitledName: translate('en', 'projects.untitled'),
        }),
      };
    }
    started.current.promise.then((result) => {
      if (!cancelled) setBoot(result);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setBoot({ phase: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  return { boot, retry };
}
