import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkLength, formatLength, parseLength } from './lengths';

describe('parseLength', () => {
  it.each([
    ['4', 'm', 4],
    ['4.5', 'm', 4.5],
    ['4,5', 'm', 4.5],
    [' 3.25 ', 'm', 3.25],
    ['450', 'cm', 4.5],
    ['325', 'cm', 3.25],
    ['.5', 'm', 0.5],
    ['4.', 'm', 4],
    ['0', 'm', 0],
  ] as const)('reads %j in %s as %s m', (text, unit, expected) => {
    expect(parseLength(text, unit)).toBe(expected);
  });

  it.each(['', ' ', 'abc', '4m', '1e3', '-2', '+2', '4..5', '4.5.6', '1 000', '0x10', '∞', 'NaN'])(
    'refuses %j',
    (text) => {
      expect(parseLength(text, 'm')).toBeNull();
    },
  );

  it('never returns a number that is not finite', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 14 }), fc.constantFrom('m', 'cm'), (text, unit) => {
        const value = parseLength(text, unit);
        if (value !== null) expect(Number.isFinite(value)).toBe(true);
      }),
    );
  });
});

describe('formatLength', () => {
  it('shows metres with up to two decimals and centimetres whole', () => {
    expect(formatLength(4, 'm')).toBe('4');
    expect(formatLength(4.5, 'm')).toBe('4.5');
    expect(formatLength(3.456, 'm')).toBe('3.46');
    expect(formatLength(4.5, 'cm')).toBe('450');
    expect(formatLength(2.6, 'cm')).toBe('260');
  });

  it('is read back as the same length, to the centimetre, in either unit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 1200 }),
        fc.constantFrom('m', 'cm'),
        (centimetres, unit) => {
          const metres = centimetres / 100;
          expect(parseLength(formatLength(metres, unit), unit)).toBe(metres);
        },
      ),
    );
  });
});

describe('checkLength', () => {
  const range = { min: 2, max: 12 };

  it('accepts the limits themselves and what is between them', () => {
    expect(checkLength('2', 'm', range)).toEqual({ ok: true, metres: 2 });
    expect(checkLength('12', 'm', range)).toEqual({ ok: true, metres: 12 });
    expect(checkLength('450', 'cm', range)).toEqual({ ok: true, metres: 4.5 });
  });

  it('says why a value cannot be confirmed', () => {
    expect(checkLength('', 'm', range)).toEqual({ ok: false, reason: 'empty' });
    expect(checkLength('  ', 'm', range)).toEqual({ ok: false, reason: 'empty' });
    expect(checkLength('x', 'm', range)).toEqual({ ok: false, reason: 'nan' });
    expect(checkLength('1.99', 'm', range)).toEqual({ ok: false, reason: 'min' });
    expect(checkLength('12.01', 'm', range)).toEqual({ ok: false, reason: 'max' });
    expect(checkLength('1200', 'm', range)).toEqual({ ok: false, reason: 'max' });
    expect(checkLength('1200', 'cm', range)).toEqual({ ok: true, metres: 12 });
  });

  it('only accepts values inside the range', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10 }), fc.constantFrom('m', 'cm'), (text, unit) => {
        const result = checkLength(text, unit, range);
        if (result.ok) {
          expect(result.metres).toBeGreaterThanOrEqual(range.min);
          expect(result.metres).toBeLessThanOrEqual(range.max);
        }
      }),
    );
  });
});
