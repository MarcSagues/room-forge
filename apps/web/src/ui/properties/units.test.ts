import { describe, expect, it } from 'vitest';
import {
  cmToMetres,
  degreesToRadians,
  formatNumber,
  metresToCm,
  parseNumber,
  radiansToDegrees,
} from './units';

describe('length units (the model keeps metres, the UI shows centimetres)', () => {
  it('converts both ways', () => {
    expect(metresToCm(1.425)).toBeCloseTo(142.5);
    expect(cmToMetres(142.5)).toBeCloseTo(1.425);
    expect(cmToMetres(metresToCm(0.3))).toBeCloseTo(0.3);
  });
});

describe('angle units (the model keeps radians, the UI shows degrees)', () => {
  it('shows 0–360, to a tenth of a degree', () => {
    expect(radiansToDegrees(0)).toBe(0);
    expect(radiansToDegrees(Math.PI / 2)).toBe(90);
    expect(radiansToDegrees(-Math.PI / 2)).toBe(270);
    expect(radiansToDegrees(Math.PI)).toBe(180);
    expect(radiansToDegrees(-0.0001)).toBe(0);
    expect(radiansToDegrees(Math.PI / 12)).toBe(15);
  });

  it('converts degrees back, any turn', () => {
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2);
    expect(degreesToRadians(-90)).toBeCloseTo(-Math.PI / 2);
    expect(degreesToRadians(450)).toBeCloseTo((5 * Math.PI) / 2);
  });
});

describe('formatNumber', () => {
  it('drops needless decimals and never shows -0', () => {
    expect(formatNumber(142.5)).toBe('142.5');
    expect(formatNumber(140)).toBe('140');
    expect(formatNumber(140.04)).toBe('140');
    expect(formatNumber(140.06)).toBe('140.1');
    expect(formatNumber(-0.01)).toBe('0');
    expect(formatNumber(-12.5)).toBe('-12.5');
  });
});

describe('parseNumber', () => {
  it('reads what people type: spaces, a decimal point or comma, a sign', () => {
    expect(parseNumber('142.5')).toBe(142.5);
    expect(parseNumber('  142,5 ')).toBe(142.5);
    expect(parseNumber('-3')).toBe(-3);
    expect(parseNumber('+3')).toBe(3);
    expect(parseNumber('0')).toBe(0);
    expect(parseNumber('.5')).toBe(0.5);
  });

  it('rejects anything else', () => {
    for (const text of ['', ' ', 'abc', '1 2', '1.2.3', '--1', '1e3', 'Infinity', 'NaN', '12cm']) {
      expect(parseNumber(text), text).toBeNull();
    }
  });
});
