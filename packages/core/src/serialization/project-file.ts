import { LIMITS, SCHEMA_VERSION, type SceneDocument, SceneDocumentSchema } from '../domain';
import type { CatalogProvider } from '../ports';
import { checkInvariants } from '../session/invariants';
import { type Hostile, inspectUntrusted, utf8ByteLength } from './guard';
import { migrateDocument } from './migrations';

/** The `format` field of every RoomForge project file (DOMAIN_MODEL §7). */
export const PROJECT_FORMAT = 'roomforge-scene';
/** Version of the envelope itself (not of the document inside it). */
export const PROJECT_FORMAT_VERSION = 1;

/** Deepest nesting and most values a project file may have: a real one is a fraction of this. */
const MAX_DEPTH = 32;
const MAX_NODES = 200_000;

export interface Project {
  name: string;
  document: SceneDocument;
}

/** What the caller knows about the export; core has no clock and no app version of its own. */
export interface ProjectMeta {
  appVersion: string;
  /** ISO 8601, e.g. `2026-10-08T12:00:00Z`. */
  exportedAt: string;
}

export interface ParsedProject extends Project {
  appVersion?: string;
  exportedAt?: string;
  /**
   * Catalog ids the given catalog does not know. They are kept in the document (invariant I6) and
   * drawn as placeholders; this is for telling the person. Empty without a catalog to ask.
   */
  unknownCatalogIds: string[];
  /** The schema version the file was written with, when it had to be migrated. */
  migratedFrom?: number;
}

export type ImportErrorCode =
  | 'TOO_LARGE'
  | 'INVALID_JSON'
  | 'HOSTILE_INPUT'
  | 'NOT_A_PROJECT'
  | 'NEWER_VERSION'
  | 'INVALID_VERSION'
  | 'MIGRATION_FAILED'
  | 'INVALID_DOCUMENT'
  | 'INVARIANT_VIOLATION';

/** Why a file could not be opened. The UI translates by `code`; `message` is for logs and tests. */
export interface ImportError {
  code: ImportErrorCode;
  message: string;
  /** One line per problem (`path: message`), for the schema and invariant errors. */
  details: string[];
  /** For `NEWER_VERSION`: the version found and the newest this app reads. */
  found?: number;
  supported?: number;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface ParseOptions {
  /** Used to judge geometry and to list unknown ids; without it every id is unknown. */
  catalog?: CatalogProvider;
  /** Largest file accepted, in bytes (default `LIMITS.maxImportBytes`). */
  maxBytes?: number;
}

/**
 * The text of a project file: the envelope with the document inside. The caller supplies the app
 * version and the time. Compact by default; `pretty` indents it for people.
 */
export function serializeProject(
  project: Project,
  meta: ProjectMeta,
  options: { pretty?: boolean } = {},
): string {
  return JSON.stringify(
    {
      format: PROJECT_FORMAT,
      formatVersion: PROJECT_FORMAT_VERSION,
      appVersion: meta.appVersion,
      exportedAt: meta.exportedAt,
      project: { name: project.name },
      document: project.document,
    },
    null,
    options.pretty ? 2 : undefined,
  );
}

const fail = (
  code: ImportErrorCode,
  message: string,
  extra: Partial<Pick<ImportError, 'details' | 'found' | 'supported'>> = {},
): Result<never, ImportError> => ({
  ok: false,
  error: { code, message, details: extra.details ?? [], ...extra },
});

const HOSTILE_MESSAGES: Record<Hostile['reason'], string> = {
  'unsafe-key': 'The file contains a key that is not allowed',
  'too-deep': 'The file is nested too deeply',
  'too-many-nodes': 'The file contains too many values',
  cycle: 'The file refers to itself',
};

/**
 * Opens a project file from its text. Untrusted input: never throws, and every way it can go
 * wrong is an `ImportError` with a code. Order of checks: size, JSON, hostile shapes, envelope,
 * version (newer is refused, older is migrated), schema, invariants.
 */
export function parseProjectFile(
  text: string,
  options: ParseOptions = {},
): Result<ParsedProject, ImportError> {
  const maxBytes = options.maxBytes ?? LIMITS.maxImportBytes;
  // Characters never outnumber bytes, so a long string is refused before it is measured.
  if (typeof text !== 'string') return fail('INVALID_JSON', 'The file is not text');
  if (text.length > maxBytes || utf8ByteLength(text) > maxBytes) {
    return fail('TOO_LARGE', `The file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    // The engine gives up on absurd nesting with a RangeError: that is a hostile file, not a typo.
    if (error instanceof RangeError) return fail('HOSTILE_INPUT', HOSTILE_MESSAGES['too-deep']);
    return fail('INVALID_JSON', 'The file is not valid JSON');
  }
  return parseProjectValue(value, options);
}

/**
 * The same as `parseProjectFile` for a value that is already parsed (a record read from storage, a
 * share link). It is as untrusted as text: nothing is assumed about its shape.
 */
export function parseProjectValue(
  value: unknown,
  options: ParseOptions = {},
): Result<ParsedProject, ImportError> {
  const hostile = inspectUntrusted(value, { maxDepth: MAX_DEPTH, maxNodes: MAX_NODES });
  if (hostile) {
    return fail('HOSTILE_INPUT', HOSTILE_MESSAGES[hostile.reason], {
      details: hostile.detail ? [hostile.detail] : [],
    });
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('NOT_A_PROJECT', 'This is not a RoomForge project file');
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.format !== PROJECT_FORMAT) {
    return fail('NOT_A_PROJECT', 'This is not a RoomForge project file');
  }
  const formatVersion = envelope.formatVersion;
  if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion) || formatVersion < 1) {
    return fail('INVALID_VERSION', 'The file format version is not valid');
  }
  if (formatVersion > PROJECT_FORMAT_VERSION)
    return newerVersion(formatVersion, PROJECT_FORMAT_VERSION);

  const project = envelope.project;
  const name = (project as { name?: unknown } | null | undefined)?.name;
  if (typeof name !== 'string' || name.length > LIMITS.maxNameLength) {
    return fail('INVALID_DOCUMENT', 'The project needs a name of at most 80 characters', {
      details: ['project.name: expected a string of at most 80 characters'],
    });
  }
  const appVersion = envelope.appVersion;
  const exportedAt = envelope.exportedAt;

  const document = envelope.document;
  const schemaVersion = (document as { schemaVersion?: unknown } | null | undefined)?.schemaVersion;
  if (
    typeof document !== 'object' ||
    document === null ||
    typeof schemaVersion !== 'number' ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 0
  ) {
    return fail('INVALID_VERSION', 'The document has no valid schema version');
  }
  if (schemaVersion > SCHEMA_VERSION) return newerVersion(schemaVersion, SCHEMA_VERSION);

  let current: unknown = document;
  if (schemaVersion < SCHEMA_VERSION) {
    const migrated = migrateDocument(document, schemaVersion);
    if (!migrated.ok) return fail('MIGRATION_FAILED', migrated.message);
    current = migrated.document;
  }

  const parsed = SceneDocumentSchema.safeParse(current);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) =>
      issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    );
    return fail('INVALID_DOCUMENT', 'The document is not valid', { details });
  }

  const catalog = options.catalog ?? { getItem: () => undefined };
  const violations = checkInvariants(parsed.data, catalog);
  if (violations.length > 0) {
    return fail('INVARIANT_VIOLATION', 'The document breaks the rules of a valid scene', {
      details: violations.map((violation) => `${violation.path.join('.')}: ${violation.message}`),
    });
  }

  const unknownCatalogIds = new Set<string>();
  for (const object of Object.values(parsed.data.objects)) {
    if (!catalog.getItem(object.catalogId)) unknownCatalogIds.add(object.catalogId);
  }

  return {
    ok: true,
    value: {
      name,
      document: parsed.data,
      ...(typeof appVersion === 'string' ? { appVersion } : {}),
      ...(typeof exportedAt === 'string' ? { exportedAt } : {}),
      unknownCatalogIds: [...unknownCatalogIds].sort(),
      ...(schemaVersion < SCHEMA_VERSION ? { migratedFrom: schemaVersion } : {}),
    },
  };
}

function newerVersion(found: number, supported: number): Result<never, ImportError> {
  return fail(
    'NEWER_VERSION',
    'This file is from a newer version of RoomForge. Update the app to open it.',
    { found, supported },
  );
}
