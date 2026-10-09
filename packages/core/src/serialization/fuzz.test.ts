import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { SceneDocumentSchema } from '../domain';
import { checkInvariants } from '../session/invariants';
import { arbitraryDocument, buildDocument, createFixtureCatalog } from '../testing';
import { type ImportErrorCode, parseProjectFile, serializeProject } from './project-file';

/**
 * Fuzzing of the one door untrusted data comes through (P7-09, R19): 10 000 random and mutated
 * inputs. For every one of them: no exception, no hang, no pollution of the prototypes, and either
 * a typed error or a document that really is valid. Random inputs find what nobody thought to test.
 */

const CODES = new Set<ImportErrorCode>([
  'TOO_LARGE',
  'INVALID_JSON',
  'HOSTILE_INPUT',
  'NOT_A_PROJECT',
  'NEWER_VERSION',
  'INVALID_VERSION',
  'MIGRATION_FAILED',
  'INVALID_DOCUMENT',
  'INVARIANT_VIOLATION',
]);

/** Inputs per family; together they are the 10 000 of the criterion. */
const RUNS = { raw: 2_000, json: 2_000, textMutations: 4_000, structureMutations: 2_000 };

/** No single input may take longer than this: a parser that stalls is a denial of service. */
const SLOWEST_ALLOWED_MS = 1_000;

const catalog = createFixtureCatalog();
const META = { appVersion: 'fuzz', exportedAt: '2026-10-09T12:00:00Z' };
const validText = serializeProject({ name: 'Fuzz', document: buildDocument() }, META);
const validValue = JSON.parse(validText) as Record<string, unknown>;

let inputs = 0;
let slowest = 0;
const outcomes = new Map<string, number>();

/** The invariant of the whole suite: whatever comes in, only these outcomes come out. */
function check(text: string): void {
  const started = Date.now();
  const result = parseProjectFile(text, { catalog });
  slowest = Math.max(slowest, Date.now() - started);
  inputs += 1;
  if (result.ok) {
    outcomes.set('ok', (outcomes.get('ok') ?? 0) + 1);
    if (!SceneDocumentSchema.safeParse(result.value.document).success) {
      throw new Error(`accepted a document the schema rejects: ${text.slice(0, 200)}`);
    }
    if (checkInvariants(result.value.document, catalog).length > 0) {
      throw new Error(`accepted a document that breaks the invariants: ${text.slice(0, 200)}`);
    }
    return;
  }
  const { code, message, details } = result.error;
  outcomes.set(code, (outcomes.get(code) ?? 0) + 1);
  if (!CODES.has(code)) throw new Error(`unknown error code ${String(code)}`);
  if (typeof message !== 'string' || !Array.isArray(details)) {
    throw new Error(`malformed error for ${code}`);
  }
}

// ── Mutating text ───────────────────────────────────────────────

const HOSTILE_TOKENS = [
  '"__proto__"',
  '{"__proto__":{"polluted":true}}',
  '"constructor"',
  '"prototype"',
  '[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[',
  '{"a":{"a":{"a":{"a":{"a":{"a":{"a":{"a":{"a":',
  '1e999',
  '-1e999',
  '1e-999',
  '99999999999999999999999999999',
  '-0',
  'null',
  'true',
  '"\\ud800"',
  '"\\u0000"',
  '\u0000',
  '﻿',
  '\ud800',
  '\\',
  '"',
  '{',
  '}',
  '[',
  ']',
  ',',
  ':',
];

type Mutation =
  | { op: 'delete'; at: number; length: number }
  | { op: 'insert'; at: number; text: string }
  | { op: 'replace'; at: number; text: string }
  | { op: 'duplicate'; at: number; length: number }
  | { op: 'truncate'; at: number }
  | { op: 'repeat'; at: number; length: number; times: number };

const fraction = fc.double({ min: 0, max: 1, noNaN: true });
const mutation: fc.Arbitrary<Mutation> = fc.oneof(
  fc.record({ op: fc.constant('delete' as const), at: fraction, length: fc.nat({ max: 40 }) }),
  fc.record({
    op: fc.constant('insert' as const),
    at: fraction,
    text: fc.oneof(fc.constantFrom(...HOSTILE_TOKENS), fc.string({ maxLength: 12 })),
  }),
  fc.record({
    op: fc.constant('replace' as const),
    at: fraction,
    text: fc.oneof(fc.constantFrom(...HOSTILE_TOKENS), fc.string({ maxLength: 3 })),
  }),
  fc.record({ op: fc.constant('duplicate' as const), at: fraction, length: fc.nat({ max: 200 }) }),
  fc.record({ op: fc.constant('truncate' as const), at: fraction }),
  fc.record({
    op: fc.constant('repeat' as const),
    at: fraction,
    length: fc.integer({ min: 1, max: 6 }),
    times: fc.integer({ min: 2, max: 400 }),
  }),
);

function mutate(text: string, m: Mutation): string {
  const at = Math.min(text.length, Math.floor(m.at * text.length));
  switch (m.op) {
    case 'delete':
      return text.slice(0, at) + text.slice(at + m.length);
    case 'insert':
      return text.slice(0, at) + m.text + text.slice(at);
    case 'replace':
      return text.slice(0, at) + m.text + text.slice(at + m.text.length);
    case 'duplicate':
      return text.slice(0, at + m.length) + text.slice(at);
    case 'truncate':
      return text.slice(0, at);
    case 'repeat':
      return text.slice(0, at) + text.slice(at, at + m.length).repeat(m.times) + text.slice(at);
  }
}

// ── Mutating structure ──────────────────────────────────────────

/** Walks `value` along `path` (each number picks the n-th key) and returns the parent and key. */
function locate(
  root: unknown,
  path: number[],
): { parent: Record<string, unknown> | unknown[]; key: string } | undefined {
  let node = root;
  let parent: Record<string, unknown> | unknown[] | undefined;
  let key = '';
  for (const choice of path) {
    if (typeof node !== 'object' || node === null) break;
    const keys = Object.keys(node);
    if (keys.length === 0) break;
    key = keys[choice % keys.length] as string;
    parent = node as Record<string, unknown>;
    node = (node as Record<string, unknown>)[key];
  }
  return parent ? { parent, key } : undefined;
}

type Edit =
  | { op: 'set'; path: number[]; value: unknown }
  | { op: 'remove'; path: number[] }
  | { op: 'addKey'; path: number[]; key: string; value: unknown };

const path = fc.array(fc.nat({ max: 12 }), { minLength: 1, maxLength: 7 });
const anyValue = fc.oneof(
  fc.jsonValue(),
  fc.constantFrom<unknown>(null, true, false, 0, -1, 1e308, 2 ** 53, '', 'x', [], {}, [[]]),
);
const edit: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({ op: fc.constant('set' as const), path, value: anyValue }),
  fc.record({ op: fc.constant('remove' as const), path }),
  fc.record({
    op: fc.constant('addKey' as const),
    path,
    key: fc.oneof(
      fc.constantFrom('__proto__', 'constructor', 'prototype', 'toString'),
      fc.string(),
    ),
    value: anyValue,
  }),
);

/**
 * A fresh copy of a generated value. fast-check replays the same inputs while it shrinks, and a
 * later edit can add a key to a value an earlier one inserted: editing the generated instance
 * itself would corrupt later runs (and could make the document refer to itself).
 */
function fresh(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function applyEdit(root: unknown, e: Edit): void {
  const target = locate(root, e.path);
  if (!target) return;
  const { parent, key } = target;
  const record = parent as Record<string, unknown>;
  if (e.op === 'set') {
    // Defined as an own property, so that a "__proto__" key survives JSON.stringify as hostile text.
    Object.defineProperty(record, key, {
      value: fresh(e.value),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  } else if (e.op === 'remove') {
    delete record[key];
  } else {
    const holder = record[key];
    if (typeof holder === 'object' && holder !== null) {
      Object.defineProperty(holder, e.key, {
        value: fresh(e.value),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
}

// ── The suite ───────────────────────────────────────────────────

describe('importing a project file: 10 000 random and mutated inputs', () => {
  it('survives arbitrary text', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 300 }), check), {
      numRuns: RUNS.raw,
    });
  });

  it('survives arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => check(JSON.stringify(value))),
      { numRuns: RUNS.json },
    );
  });

  it('survives a valid project file with its text damaged', () => {
    fc.assert(
      fc.property(fc.array(mutation, { minLength: 1, maxLength: 5 }), (mutations) => {
        check(mutations.reduce(mutate, validText));
      }),
      { numRuns: RUNS.textMutations },
    );
  });

  it('survives the text of any valid document, damaged', () => {
    fc.assert(
      fc.property(
        arbitraryDocument(),
        fc.array(mutation, { minLength: 1, maxLength: 4 }),
        (document, mutations) => {
          const text = serializeProject({ name: 'Any', document }, META);
          check(mutations.reduce(mutate, text));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('survives a valid project whose structure has been tampered with', () => {
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 4 }), (edits) => {
        const value = JSON.parse(validText) as Record<string, unknown>;
        for (const e of edits) applyEdit(value, e);
        check(JSON.stringify(value));
      }),
      { numRuns: RUNS.structureMutations },
    );
  });

  it('still accepts the untouched file (the fuzz is not just refusing everything)', () => {
    expect(parseProjectFile(validText, { catalog }).ok).toBe(true);
    expect(validValue.format).toBe('roomforge-scene');
  });

  afterAll(() => {
    // These are the facts the criterion asks for, checked once everything has run.
    expect(inputs).toBeGreaterThanOrEqual(10_000);
    expect(slowest).toBeLessThan(SLOWEST_ALLOWED_MS);
    expect(Object.keys(Object.prototype)).toEqual([]);
    expect(Object.keys(Array.prototype)).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // The fuzz reaches both outcomes and several kinds of error: it is exercising the parser.
    expect(outcomes.get('ok') ?? 0).toBeGreaterThan(0);
    expect(outcomes.size).toBeGreaterThanOrEqual(4);
  });
});
