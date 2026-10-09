import { HexColorSchema } from '@roomforge/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseHexColor } from './hex';

describe('parseHexColor', () => {
  it.each([
    ['#AABBCC', '#aabbcc'],
    ['aabbcc', '#aabbcc'],
    ['  #1a2B3c ', '#1a2b3c'],
    ['#abc', '#aabbcc'],
    ['F80', '#ff8800'],
  ])('reads %j as %s', (input, expected) => {
    expect(parseHexColor(input)).toBe(expected);
  });

  it.each(['', '#', '#12', '#1234', '#12345', '#1234567', '#ggg', 'red', '#12 456', '##123456'])(
    'refuses %j',
    (input) => {
      expect(parseHexColor(input)).toBeNull();
    },
  );

  it('only ever returns colours the document accepts', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), (input) => {
        const parsed = parseHexColor(input);
        if (parsed !== null) expect(HexColorSchema.safeParse(parsed).success).toBe(true);
      }),
    );
  });

  it('accepts every six-digit colour, written either way', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffff }), (value) => {
        const digits = value.toString(16).padStart(6, '0');
        expect(parseHexColor(digits)).toBe(`#${digits}`);
        expect(parseHexColor(`#${digits.toUpperCase()}`)).toBe(`#${digits}`);
      }),
    );
  });
});
