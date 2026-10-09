import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { HexColor, LightState } from '../domain';
import { BREATHING_MIN_LEVEL, evaluateEffect, hexToRgb, rgbToHex } from './effects';

const RED = '#ff0000' as HexColor;
const BASE = '#336699' as HexColor;

describe('evaluateEffect: static', () => {
  it('is the base colour at full level, whatever the time', () => {
    for (const t of [0, 0.5, 3, 1000, -4]) {
      expect(evaluateEffect({ kind: 'static' }, BASE, t)).toEqual({ color: BASE, level: 1 });
    }
  });
});

describe('evaluateEffect: breathing', () => {
  // speed 1 → one breath every 4 s: dim at 0, brightest at 2 s, dim again at 4 s.
  const breathe = (t: number, speed = 1) => evaluateEffect({ kind: 'breathing', speed }, BASE, t);

  it('follows a table of times: minimum, rising, peak, falling, minimum', () => {
    const table: [number, number][] = [
      [0, BREATHING_MIN_LEVEL],
      [1, 0.5 * (BREATHING_MIN_LEVEL + 1)],
      [2, 1],
      [3, 0.5 * (BREATHING_MIN_LEVEL + 1)],
      [4, BREATHING_MIN_LEVEL],
    ];
    for (const [t, level] of table) expect(breathe(t).level, `t = ${t}`).toBeCloseTo(level, 9);
  });

  it('keeps the colour of the light: only the brightness breathes', () => {
    for (const t of [0, 0.7, 2, 3.3]) expect(breathe(t).color).toBe(BASE);
  });

  it('is periodic, and a higher speed shortens the period proportionally', () => {
    expect(breathe(0.3 + 4).level).toBeCloseTo(breathe(0.3).level, 9);
    expect(breathe(1.1, 2).level).toBeCloseTo(breathe(2.2, 1).level, 9); // twice as fast = twice the time
    expect(breathe(0.4, 4).level).toBeCloseTo(breathe(0.4 + 1, 4).level, 9);
  });

  it('never leaves its limits, at any time or speed (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e5, max: 1e5, noNaN: true }),
        fc.double({ min: 0.01, max: 10, noNaN: true }),
        (t, speed) => {
          const { level } = evaluateEffect({ kind: 'breathing', speed }, BASE, t);
          expect(level).toBeGreaterThanOrEqual(BREATHING_MIN_LEVEL - 1e-12);
          expect(level).toBeLessThanOrEqual(1 + 1e-12);
        },
      ),
    );
  });
});

describe('evaluateEffect: cycle with a palette', () => {
  // speed 1: each colour takes 2 s to turn into the next one; the palette loops.
  const effect = (palette: HexColor[], speed = 1): LightState['effect'] => ({
    kind: 'cycle',
    speed,
    palette,
  });
  const PALETTE = [RED, '#0000ff' as HexColor];

  it('is the palette colour at its time, halfway between at the middle, and loops back', () => {
    const at = (t: number) => evaluateEffect(effect(PALETTE), BASE, t).color;
    expect(at(0)).toBe('#ff0000');
    expect(at(1)).toBe('#800080'); // halfway red → blue
    expect(at(2)).toBe('#0000ff');
    expect(at(3)).toBe('#800080'); // blue → red
    expect(at(4)).toBe('#ff0000');
    expect(at(4 + 1)).toBe(at(1)); // periodic
  });

  it('always lights at full level', () => {
    expect(evaluateEffect(effect(PALETTE), BASE, 1.3).level).toBe(1);
  });

  it('speed scales time', () => {
    expect(evaluateEffect(effect(PALETTE, 2), BASE, 0.5).color).toBe('#800080');
    expect(evaluateEffect(effect(PALETTE, 0.5), BASE, 2).color).toBe('#800080');
  });

  it('a one-colour palette is that colour for ever', () => {
    for (const t of [0, 1.7, 55]) {
      expect(evaluateEffect(effect([RED]), BASE, t).color).toBe('#ff0000');
    }
  });

  it('handles negative times like the same point of the loop', () => {
    expect(evaluateEffect(effect(PALETTE), BASE, -1).color).toBe(
      evaluateEffect(effect(PALETTE), BASE, 3).color,
    );
  });

  it('always gives a valid colour (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 0xffffff }), { minLength: 1, maxLength: 8 }),
        fc.double({ min: 0.01, max: 10, noNaN: true }),
        fc.double({ min: -1e5, max: 1e5, noNaN: true }),
        (colours, speed, t) => {
          const palette = colours.map((n) => `#${n.toString(16).padStart(6, '0')}` as HexColor);
          expect(evaluateEffect(effect(palette, speed), BASE, t).color).toMatch(/^#[0-9a-f]{6}$/);
        },
      ),
    );
  });
});

describe('evaluateEffect: cycle without a palette', () => {
  const rainbow = (t: number, speed = 1) => evaluateEffect({ kind: 'cycle', speed }, RED, t).color;

  it('starts at the base colour and turns its hue once every ten seconds', () => {
    expect(rainbow(0)).toBe('#ff0000');
    expect(rainbow(10)).toBe(rainbow(0));
    expect(rainbow(10 / 3)).toBe('#00ff00'); // a third of the way round from red
    expect(rainbow((2 * 10) / 3)).toBe('#0000ff');
  });

  it('a faster speed goes round faster', () => {
    expect(rainbow(10 / 6, 2)).toBe('#00ff00');
  });

  it('leaves a grey alone (it has no hue to turn)', () => {
    const grey = '#808080' as HexColor;
    expect(evaluateEffect({ kind: 'cycle', speed: 1 }, grey, 3.7).color).toBe('#808080');
  });
});

describe('colour helpers', () => {
  it('round-trips hex through rgb, with rounding and clamping', () => {
    expect(rgbToHex(hexToRgb('#336699'))).toBe('#336699');
    expect(rgbToHex([300, -5, 127.6])).toBe('#ff0080');
    expect(hexToRgb('#FF8000')).toEqual([255, 128, 0]);
  });
});
