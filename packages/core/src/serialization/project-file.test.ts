import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LIMITS, type PlacedObject, SCHEMA_VERSION, type SceneDocument } from '../domain';
import { checkInvariants } from '../session/invariants';
import { arbitraryDocument, buildDocument, buildObject, createFixtureCatalog } from '../testing';
import { GOLDEN_CASES } from './migrations/golden';
import {
  type ImportError,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  parseProjectFile,
  parseProjectValue,
  serializeProject,
} from './project-file';

const META = { appVersion: '0.4.0', exportedAt: '2026-10-08T12:00:00Z' };
const NO_CATALOG = { getItem: () => undefined };

/** The document with these objects added (or replaced), in order. */
function withObjects(document: SceneDocument, added: PlacedObject[]): SceneDocument {
  const objects = { ...document.objects } as Record<string, PlacedObject>;
  for (const object of added) objects[object.id] = object;
  return {
    ...document,
    objects: objects as SceneDocument['objects'],
    objectOrder: [...new Set([...document.objectOrder, ...added.map((object) => object.id)])],
  };
}

const file = (document: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    project: { name: 'My setup' },
    document,
    ...extra,
  });

function errorOf(text: string, options?: Parameters<typeof parseProjectFile>[1]): ImportError {
  const result = parseProjectFile(text, options);
  if (result.ok) throw new Error('expected an import error');
  return result.error;
}

describe('serializeProject', () => {
  it('wraps the document in the envelope of DOMAIN_MODEL §7', () => {
    const document = buildDocument();
    const parsed = JSON.parse(serializeProject({ name: 'My setup', document }, META));
    expect(parsed).toMatchObject({
      format: 'roomforge-scene',
      formatVersion: 1,
      appVersion: '0.4.0',
      exportedAt: '2026-10-08T12:00:00Z',
      project: { name: 'My setup' },
    });
    expect(parsed.document).toEqual(JSON.parse(JSON.stringify(document)));
    expect(parsed.document.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('is the same text for the same project, compact or indented on request', () => {
    const project = { name: 'A', document: buildDocument() };
    expect(serializeProject(project, META)).toBe(serializeProject(project, META));
    expect(serializeProject(project, META)).not.toContain('\n');
    expect(serializeProject(project, META, { pretty: true })).toContain('\n  "format"');
  });
});

describe('parseProjectFile: the round trip', () => {
  it('gives back what was saved', () => {
    const document = buildDocument();
    const result = parseProjectFile(serializeProject({ name: 'My setup', document }, META));
    expect(result).toMatchObject({ ok: true, value: { name: 'My setup', ...META } });
    if (result.ok) expect(result.value.document).toEqual(document);
  });

  it('holds for any valid document (property)', () => {
    fc.assert(
      fc.property(
        arbitraryDocument().filter((doc) => checkInvariants(doc, NO_CATALOG).length === 0),
        fc.string({ maxLength: LIMITS.maxNameLength }),
        (document: SceneDocument, name) => {
          const result = parseProjectFile(serializeProject({ name, document }, META));
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.document).toEqual(document);
            expect(result.value.name).toBe(name);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('keeps an unknown catalog id, and lists it (invariant I6)', () => {
    const document = buildDocument();
    const withUnknown = withObjects(document, [
      buildObject({ id: 'mystery', catalogId: 'sofa.from.the.future' }),
    ]);
    const text = serializeProject({ name: 'x', document: withUnknown }, META);
    const result = parseProjectFile(text, { catalog: createFixtureCatalog() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.unknownCatalogIds).toEqual(['sofa.from.the.future']);
    expect(Object.keys(result.value.document.objects)).toContain('mystery');
    // Without a catalog nothing can be told apart: every id is unknown.
    const none = parseProjectFile(text);
    expect(none.ok && none.value.unknownCatalogIds.length).toBeGreaterThan(0);
  });

  it('drops keys the schema does not know', () => {
    const document = JSON.parse(JSON.stringify(buildDocument()));
    document.rooms['room-1'].colour = 'teal';
    document.somethingNew = { a: 1 };
    const result = parseProjectFile(file(document, { extra: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document).toEqual(buildDocument());
    expect('somethingNew' in result.value.document).toBe(false);
  });
});

describe('parseProjectFile: errors, one per kind', () => {
  it('INVALID_JSON: not JSON at all', () => {
    for (const text of ['', '   ', '{', 'not json', '[1,', "{'a': 1}"]) {
      expect(errorOf(text), text).toMatchObject({ code: 'INVALID_JSON' });
    }
  });

  it('TOO_LARGE: over the size limit, without trying to parse it', () => {
    const big = ' '.repeat(LIMITS.maxImportBytes + 1);
    expect(errorOf(big)).toMatchObject({ code: 'TOO_LARGE' });
    // Bytes, not characters: 1.8 M three-byte characters are over 5 MB.
    const wide = '€'.repeat(1_800_000);
    expect(wide.length).toBeLessThan(LIMITS.maxImportBytes);
    expect(errorOf(wide)).toMatchObject({ code: 'TOO_LARGE' });
    expect(errorOf('{}', { maxBytes: 1 })).toMatchObject({ code: 'TOO_LARGE' });
  });

  it('NOT_A_PROJECT: valid JSON that is not a RoomForge file', () => {
    for (const text of [
      '{}',
      '[]',
      'null',
      '42',
      '"text"',
      '{"format":"other"}',
      '{"document":{}}',
    ]) {
      expect(errorOf(text), text).toMatchObject({ code: 'NOT_A_PROJECT' });
    }
  });

  it('NEWER_VERSION: a file from a newer app, by file format or by schema', () => {
    const byFormat = errorOf(file(buildDocument(), { formatVersion: 2 }));
    expect(byFormat).toMatchObject({ code: 'NEWER_VERSION', found: 2, supported: 1 });
    expect(byFormat.message).toMatch(/newer version.*update/i);
    const document = { ...buildDocument(), schemaVersion: SCHEMA_VERSION + 1 };
    expect(errorOf(file(document))).toMatchObject({
      code: 'NEWER_VERSION',
      found: SCHEMA_VERSION + 1,
      supported: SCHEMA_VERSION,
    });
  });

  it('INVALID_VERSION: a schema version that is not a whole number from 0 up', () => {
    for (const schemaVersion of [undefined, -1, 1.5, '1', null, true]) {
      const document = { ...buildDocument(), schemaVersion };
      expect(errorOf(file(document)), String(schemaVersion)).toMatchObject({
        code: 'INVALID_VERSION',
      });
    }
    expect(errorOf(file('not an object'))).toMatchObject({ code: 'INVALID_VERSION' });
    expect(errorOf(file(null))).toMatchObject({ code: 'INVALID_VERSION' });
  });

  it('INVALID_DOCUMENT: the schema says no, and names where', () => {
    const document = {
      ...buildDocument(),
      lighting: { mode: 'dusk', ambient: 0.4, sunAzimuth: 1 },
    };
    const error = errorOf(file(document));
    expect(error.code).toBe('INVALID_DOCUMENT');
    expect(error.details.join('\n')).toMatch(/lighting\.mode/);
  });

  it('INVALID_DOCUMENT: a project name that is missing or too long', () => {
    const document = buildDocument();
    expect(errorOf(file(document, { project: {} }))).toMatchObject({ code: 'INVALID_DOCUMENT' });
    expect(errorOf(file(document, { project: { name: 'x'.repeat(81) } }))).toMatchObject({
      code: 'INVALID_DOCUMENT',
    });
    expect(errorOf(file(document, { project: undefined }))).toMatchObject({
      code: 'INVALID_DOCUMENT',
    });
  });

  it('INVARIANT_VIOLATION: well-formed but impossible (an object outside its room)', () => {
    const document = buildDocument();
    const outside = withObjects(document, [
      buildObject({ id: 'desk-1', transform: { position: [40, 0, 1.5], rotationY: 0 } }),
    ]);
    const text = serializeProject({ name: 'x', document: outside }, META);
    const error = errorOf(text, { catalog: createFixtureCatalog() });
    expect(error.code).toBe('INVARIANT_VIOLATION');
    expect(error.details.join('\n')).toMatch(/desk-1/);
    // Nothing is known about the catalog id without a catalog, so the geometry cannot be judged.
    expect(parseProjectFile(text).ok).toBe(true);
  });

  it('MIGRATION_FAILED: an old file the migration cannot read', () => {
    const error = errorOf(file({ schemaVersion: 0, rooms: 'nonsense' }));
    expect(error).toMatchObject({ code: 'MIGRATION_FAILED' });
    expect(error.message).toMatch(/rooms/);
  });

  it('never carries an exception: a failure is a value', () => {
    for (const value of [undefined, null, 1, 'x', true, Symbol('s'), () => 1, new Date(), 10n]) {
      expect(() => parseProjectValue(value)).not.toThrow();
      expect(parseProjectValue(value).ok).toBe(false);
    }
  });
});

describe('parseProjectFile: old files', () => {
  it.each(GOLDEN_CASES)('opens a $name document through its migrations', (golden) => {
    const result = parseProjectFile(file(golden.input), { catalog: NO_CATALOG });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.migratedFrom).toBe(golden.from);
    expect(result.value.document).toEqual(golden.expected);
  });

  it('does not report a migration for a current document', () => {
    const result = parseProjectFile(file(buildDocument()));
    expect(result.ok && result.value.migratedFrom).toBeUndefined();
  });
});

describe('parseProjectFile: hostile input', () => {
  it('rejects __proto__ and friends without polluting anything', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const hostile = `{"format":"roomforge-scene","formatVersion":1,"project":{"name":"x"},"document":{"schemaVersion":1,"${key}":{"polluted":true}}}`;
      expect(errorOf(hostile), key).toMatchObject({ code: 'HOSTILE_INPUT' });
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects absurd nesting quickly, without overflowing the stack', () => {
    const started = Date.now();
    const text = `${'['.repeat(200_000)}${']'.repeat(200_000)}`;
    expect(errorOf(text)).toMatchObject({
      code: expect.stringMatching(/HOSTILE_INPUT|INVALID_JSON/),
    });
    const nested = file(JSON.parse(`${'['.repeat(500)}${']'.repeat(500)}`));
    expect(errorOf(nested)).toMatchObject({ code: 'HOSTILE_INPUT' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('rejects a cycle in a value that was not parsed from text', () => {
    const cyclic: Record<string, unknown> = { format: PROJECT_FORMAT, formatVersion: 1 };
    cyclic.document = cyclic;
    const result = parseProjectValue(cyclic);
    expect(result).toMatchObject({ ok: false, error: { code: 'HOSTILE_INPUT' } });
  });

  it('rejects a flood of values within the size limit, without hanging', () => {
    const started = Date.now();
    const text = `[${'1,'.repeat(2_000_000)}1]`;
    expect(text.length).toBeLessThan(LIMITS.maxImportBytes);
    expect(errorOf(text)).toMatchObject({ code: 'HOSTILE_INPUT' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('rejects 10 MB at once', () => {
    const started = Date.now();
    expect(errorOf('x'.repeat(10 * 1024 * 1024))).toMatchObject({ code: 'TOO_LARGE' });
    expect(Date.now() - started).toBeLessThan(500);
  });
});
