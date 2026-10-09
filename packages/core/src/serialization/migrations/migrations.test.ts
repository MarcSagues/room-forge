import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, SceneDocumentSchema } from '../../domain';
import { GOLDEN_CASES } from './golden';
import { MIGRATIONS, migrateDocument } from './index';

/** A deep copy of plain JSON data (core has no structuredClone: no DOM, no Node types). */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('the migration registry', () => {
  it('has one migration per version, each going up by exactly one', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    for (const migration of MIGRATIONS) expect(migration.to).toBe(migration.from + 1);
    expect(new Set(MIGRATIONS.map((migration) => migration.from)).size).toBe(MIGRATIONS.length);
  });

  it('reaches the current schema version from every older one (bumping it needs a migration)', () => {
    for (let version = 0; version < SCHEMA_VERSION; version += 1) {
      expect(
        MIGRATIONS.some((migration) => migration.from === version),
        `no migration from schema version ${version}`,
      ).toBe(true);
    }
    expect(MIGRATIONS.some((migration) => migration.to > SCHEMA_VERSION)).toBe(false);
  });

  it('has a golden file for every migration (adding a migration means adding its golden)', () => {
    for (const migration of MIGRATIONS) {
      const golden = GOLDEN_CASES.find((candidate) => candidate.from === migration.from);
      expect(golden, `migration from v${migration.from} has no golden case`).toBeDefined();
    }
    expect(GOLDEN_CASES.length).toBe(MIGRATIONS.length);
  });
});

describe.each(GOLDEN_CASES)('golden: $name', (golden) => {
  const migration = MIGRATIONS.find((candidate) => candidate.from === golden.from);

  it('produces exactly the expected document', () => {
    expect(migration?.migrate(clone(golden.input))).toEqual(golden.expected);
  });

  it('does not touch its input', () => {
    const input = clone(golden.input);
    migration?.migrate(input);
    expect(input).toEqual(golden.input);
  });

  it('migrates all the way to a document the current schema accepts', () => {
    const migrated = migrateDocument(clone(golden.input), golden.from);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const parsed = SceneDocumentSchema.safeParse(migrated.document);
    expect(parsed.success).toBe(true);
  });
});

describe('migrateDocument', () => {
  it('returns the document as it is when it is already current', () => {
    const doc = { schemaVersion: SCHEMA_VERSION };
    expect(migrateDocument(doc, SCHEMA_VERSION)).toEqual({ ok: true, document: doc });
  });

  it('reports a migration that cannot run, instead of throwing', () => {
    const result = migrateDocument({ schemaVersion: 0, rooms: 'nonsense' }, 0);
    expect(result).toMatchObject({ ok: false, from: 0 });
    if (!result.ok) expect(result.message).toMatch(/rooms/);
  });

  it('reports a missing step in the chain', () => {
    const result = migrateDocument({}, -5);
    expect(result).toMatchObject({ ok: false });
  });
});
