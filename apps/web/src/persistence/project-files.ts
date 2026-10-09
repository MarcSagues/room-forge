import {
  type CatalogProvider,
  type ImportError,
  LIMITS,
  type ParsedProject,
  type ProjectId,
  type ProjectRepository,
  parseProjectFile,
  RepositoryError,
  type Result,
  type SceneDocument,
  serializeProject,
} from '@roomforge/core';

/** A project file ready to be handed to the browser as a download. */
export interface ExportedFile {
  filename: string;
  text: string;
}

const MAX_SLUG_LENGTH = 40;

/** Lowercase letters, digits and single dashes: safe as a file name on every system. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
  return slug === '' ? 'project' : slug;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `slug-YYYY-MM-DD.roomforge.json`, the date being the one on the exporting person's calendar. */
export function exportFileName(name: string, at: Date): string {
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `${slugify(name)}-${date}.roomforge.json`;
}

export interface ExportOptions {
  /** Written into the file, so that a later version can tell which one made it. */
  appVersion: string;
  now?: () => Date;
}

/**
 * A project file of the project as it is *in the editor*, not as last saved. This is what a person
 * exports when saving has failed (a full disk, blocked storage): the copy has to hold their work.
 */
export function exportFileOf(
  project: { name: string; document: SceneDocument },
  options: ExportOptions,
): ExportedFile {
  const now = options.now?.() ?? new Date();
  const text = serializeProject(
    { name: project.name, document: project.document },
    { appVersion: options.appVersion, exportedAt: now.toISOString() },
  );
  return { filename: exportFileName(project.name, now), text };
}

/** Reads a saved project and writes it as a project file (the format of `core/serialization`). */
export async function exportProject(
  repository: ProjectRepository,
  id: ProjectId,
  options: ExportOptions,
): Promise<ExportedFile> {
  const stored = await repository.get(id);
  if (!stored) throw new RepositoryError('NOT_FOUND', `There is no project ${id}`);
  return exportFileOf(stored, options);
}

/**
 * Opens a project file the person chose: it is untrusted, so the size is checked before reading it
 * (a huge file is never loaded into memory) and everything else by `parseProjectFile`. Never
 * throws: every failure is an `ImportError` the UI can explain. Nothing is saved.
 */
export async function readProjectFile(
  file: Blob,
  options: { catalog?: CatalogProvider } = {},
): Promise<Result<ParsedProject, ImportError>> {
  if (file.size > LIMITS.maxImportBytes) {
    return {
      ok: false,
      error: {
        code: 'TOO_LARGE',
        message: `The file is larger than ${Math.round(LIMITS.maxImportBytes / (1024 * 1024))} MB`,
        details: [],
      },
    };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return {
      ok: false,
      error: { code: 'INVALID_JSON', message: 'The file could not be read', details: [] },
    };
  }
  return parseProjectFile(text, options.catalog ? { catalog: options.catalog } : {});
}

/** How long the temporary address of a download is kept: long enough for any browser to start it. */
export const REVOKE_AFTER_MS = 10_000;

/** Hands a file to the browser as a download (a temporary link that is clicked and removed). */
export function downloadFile(file: ExportedFile): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
