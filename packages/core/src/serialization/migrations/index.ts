import type { Migration } from './types';
import { v0ToV1 } from './v0-to-v1';
import { v1ToV2 } from './v1-to-v2';

export type { Migration } from './types';

/**
 * Every migration, oldest first. Changing the shape of the document (not adding an optional
 * field) means raising `SCHEMA_VERSION` and adding a migration here **and its golden file** under
 * `golden/`: the tests fail until both exist.
 */
export const MIGRATIONS: readonly Migration[] = [v0ToV1, v1ToV2];

export type MigrationResult =
  | { ok: true; document: unknown }
  | { ok: false; from: number; message: string };

/** Brings a document of schema version `from` up to the current version, one step at a time. */
export function migrateDocument(document: unknown, from: number): MigrationResult {
  let current = document;
  let version = from;
  const latest = Math.max(0, ...MIGRATIONS.map((migration) => migration.to));
  while (version < latest) {
    const step = MIGRATIONS.find((migration) => migration.from === version);
    if (!step) return { ok: false, from: version, message: `No migration from version ${version}` };
    try {
      current = step.migrate(current);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        from: version,
        message: `Migration ${version} → ${step.to} failed: ${reason}`,
      };
    }
    version = step.to;
  }
  return { ok: true, document: current };
}
