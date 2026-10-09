import { LIMITS, type ProjectId, type SceneDocument } from '../domain';

/** What the list shows: everything but the document, which can be large. */
export interface ProjectSummary {
  id: ProjectId;
  name: string;
  /** Milliseconds since the epoch, from the injected `Clock`. */
  createdAt: number;
  updatedAt: number;
}

export interface StoredProject extends ProjectSummary {
  document: SceneDocument;
}

/** What a caller saves: the repository adds the timestamps. */
export interface ProjectInput {
  id: ProjectId;
  name: string;
  document: SceneDocument;
}

export type RepositoryErrorCode =
  /** The browser has no room left for the write (the quota). Nothing was written. */
  | 'QUOTA_EXCEEDED'
  /** Another tab holds an older connection open and will not let the database be upgraded. */
  | 'BLOCKED'
  /** The database on disk was written by a newer version of the app. */
  | 'VERSION_ERROR'
  /** No storage here (private mode, blocked site data, no IndexedDB at all). */
  | 'UNAVAILABLE'
  | 'NOT_FOUND'
  | 'INVALID_NAME'
  | 'FAILED';

/** A typed storage failure: the UI chooses its message by `code`, `cause` is for the log. */
export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

/**
 * Where projects live (ADR-0004). IndexedDB in the browser, memory when there is no storage; an API
 * in a later phase. Implementations write each project in one atomic step and never leave a
 * summary without its document.
 */
export interface ProjectRepository {
  /** The newest first (by `updatedAt`, then `createdAt`). */
  list(): Promise<ProjectSummary[]>;
  get(id: ProjectId): Promise<StoredProject | undefined>;
  /** Creates the project, or replaces its name and document, keeping `createdAt`. */
  save(input: ProjectInput): Promise<ProjectSummary>;
  /** Fails with `NOT_FOUND` when there is no such project. */
  rename(id: ProjectId, name: string): Promise<ProjectSummary>;
  /** A copy under a new id; the name defaults to `<name> (copy)`. */
  duplicate(id: ProjectId, name?: string): Promise<ProjectSummary>;
  /** Deleting what is not there is not an error. */
  delete(id: ProjectId): Promise<void>;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it rejects.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const COPY_SUFFIX = ' (copy)';

/** `<name> (copy)`, with the name cut so that the result still fits the limit on names. */
export function copyProjectName(name: string): string {
  return `${name.slice(0, LIMITS.maxNameLength - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;
}

/** Trims a project name and checks it is 1 to `LIMITS.maxNameLength` printable characters. */
export function normalizeProjectName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > LIMITS.maxNameLength) {
    throw new RepositoryError(
      'INVALID_NAME',
      `A project name has 1 to ${LIMITS.maxNameLength} characters`,
    );
  }
  if (CONTROL_CHARACTERS.test(trimmed)) {
    throw new RepositoryError('INVALID_NAME', 'A project name cannot contain control characters');
  }
  return trimmed;
}

/** `base`, or `base 2`, `base 3`…: the first name that none of `taken` already has (ignoring case). */
export function uniqueProjectName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((name) => name.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
