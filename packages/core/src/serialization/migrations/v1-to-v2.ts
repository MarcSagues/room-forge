import type { Migration } from './types';

type Plain = Record<string, unknown>;

const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * v1 → v2 (P10-02). Doors gain their open state: `swing`, `hinge` and `open` are required on a
 * door, so every door of an older file becomes a closed door opening into its room, hinged on the
 * left (DOMAIN_MODEL §8.1). v1 had no such fields, so any found are overwritten. Windows and
 * everything else are copied as they are. Self-contained on purpose: the defaults are written
 * here, not imported, so the migration never changes.
 */
export const v1ToV2: Migration = {
  from: 1,
  to: 2,
  migrate(input) {
    if (!isPlain(input)) throw new Error('A v1 document must be an object');
    const { openings } = input;
    if (!isPlain(openings)) throw new Error('A v1 document needs an "openings" object');

    const migrated: Plain = {};
    for (const [id, opening] of Object.entries(openings)) {
      migrated[id] =
        isPlain(opening) && opening.kind === 'door'
          ? { ...opening, swing: 'in', hinge: 'left', open: 0 }
          : opening;
    }
    return { ...input, schemaVersion: 2, openings: migrated };
  },
};
