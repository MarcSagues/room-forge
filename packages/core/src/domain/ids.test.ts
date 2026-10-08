import { describe, expect, it } from 'vitest';
import { createSeqIdGen } from '../testing';
import { createNanoIdGen, ID_LENGTH, IdSchema } from './ids';

describe('createNanoIdGen', () => {
  it('produces short, URL-safe, schema-valid ids', () => {
    const next = createNanoIdGen();
    const ids = Array.from({ length: 500 }, next);
    for (const id of ids) {
      expect(id).toHaveLength(ID_LENGTH);
      expect(IdSchema.safeParse(id).success).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is interchangeable with the deterministic test generator', () => {
    const next = createSeqIdGen('room');
    expect(IdSchema.safeParse(next()).success).toBe(true);
  });
});

describe('IdSchema', () => {
  it.each([
    '',
    'has space',
    'slash/id',
    'x'.repeat(33),
    'ñ',
    '__proto__',
    'constructor',
    'prototype',
  ])('rejects %j', (id) => {
    expect(IdSchema.safeParse(id).success).toBe(false);
  });
});
