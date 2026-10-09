'use client';

import { useEffect, useMemo } from 'react';
import { createErrorLog, installErrorCapture, type StorageLike } from '@/editor';
import { downloadText, ErrorBoundary, FailureScreen } from '@/ui';
import { EditorLoader } from './editor-loader';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

/** The browser's local storage, or nothing where it is blocked (the log then lives in memory). */
function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The editor's outermost layer (P7-08): keeps the local error log, records what the page itself
 * would lose, and, if the whole editor fails, shows a screen with a way back, a copy of the log and
 * a report that carries no project data. The panels have boundaries of their own (the shell).
 */
export function EditorRoot() {
  const log = useMemo(() => {
    const storage = browserStorage();
    return createErrorLog(storage ? { storage } : {});
  }, []);
  useEffect(() => installErrorCapture(window, log), [log]);

  return (
    <ErrorBoundary
      onError={(error) => log.record(error, { source: 'react', where: 'the editor' })}
      fallback={({ error, reset }) => (
        <FailureScreen
          error={error}
          onRetry={reset}
          where="the editor"
          appVersion={APP_VERSION}
          onDownloadLog={() =>
            downloadText(
              'roomforge-errors.txt',
              log.toText({ app: `RoomForge ${APP_VERSION}`, browser: navigator.userAgent }),
            )
          }
        />
      )}
    >
      <EditorLoader errorLog={log} />
    </ErrorBoundary>
  );
}
