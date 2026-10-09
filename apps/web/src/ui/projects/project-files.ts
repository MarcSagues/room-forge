import type { ImportError, ParsedProject, ProjectId, Result } from '@roomforge/core';

/**
 * What the projects screen needs to move projects in and out as files. The app supplies it (it
 * knows the storage, the app version and the browser's download); the screen only asks.
 */
export interface ProjectFiles {
  /** Hands the browser a file with the saved project; resolves when it has been handed over. */
  exportProject(id: ProjectId): Promise<void>;
  /** Reads and checks a file the person chose. Saves nothing; never throws. */
  readFile(file: File): Promise<Result<ParsedProject, ImportError>>;
}
