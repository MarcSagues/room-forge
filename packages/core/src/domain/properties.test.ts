import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { arbitraryDocument } from '../testing';
import { SceneDocumentSchema } from './schemas';

// Available in every runtime core targets (browsers, Node ≥ 17); core's lib is ES-only (ADR-0001).
declare function structuredClone<T>(value: T): T;

describe('SceneDocument properties', () => {
  it('every generated document is valid', () => {
    fc.assert(
      fc.property(arbitraryDocument(), (doc) => {
        expect(SceneDocumentSchema.safeParse(doc).success).toBe(true);
      }),
    );
  });

  it('survives a JSON round-trip unchanged', () => {
    fc.assert(
      fc.property(arbitraryDocument(), (doc) => {
        expect(SceneDocumentSchema.parse(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
      }),
    );
  });

  it('parses to plain data that structuredClone copies exactly (no classes or functions)', () => {
    fc.assert(
      fc.property(arbitraryDocument(), (doc) => {
        const parsed = SceneDocumentSchema.parse(doc);
        expect(structuredClone(parsed)).toStrictEqual(parsed);
        expect(SceneDocumentSchema.parse(structuredClone(parsed))).toStrictEqual(parsed);
      }),
    );
  });
});
