import type { HexColor, LightState } from '../domain';

/** What a light looks like at one instant: its colour, and a factor for its intensity (0..1). */
export interface LightOutput {
  color: HexColor;
  /** Multiplies the light's `intensity`; 1 for a steady light, less while it dims. */
  level: number;
}

/** The dimmest a breathing light gets, as a fraction of its intensity. */
export const BREATHING_MIN_LEVEL = 0.15;
/** Seconds of one breath at speed 1; a higher speed shortens it proportionally. */
export const BREATHING_PERIOD_S = 4;
/** Seconds each palette colour takes to become the next, at speed 1. */
export const CYCLE_SEGMENT_S = 2;
/** Seconds of a full turn of the hue when a cycle has no palette, at speed 1. */
export const CYCLE_HUE_PERIOD_S = 10;

type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex([r, g, b]: Rgb): HexColor {
  const channel = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** `t` positive modulo `period`, so negative times land on the same point of the loop. */
const wrap = (t: number, period: number) => ((t % period) + period) % period;

/** Hue (degrees), saturation and lightness (0..1) of a colour. */
function toHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  return [hue * 60, saturation, lightness];
}

function fromHsl(hue: number, saturation: number, lightness: number): [number, number, number] {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;
  const sector = Math.floor(wrap(hue, 360) / 60);
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector] as [number, number, number];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * The colour and brightness factor of a light with `effect` at `t` seconds (DOMAIN_MODEL
 * `LightState`). Pure: the document stores the effect, never the time, and the engine passes its
 * clock in, so tests can check any instant.
 *
 * - `static`: the base colour, full level.
 * - `breathing`: the base colour whose level swells from `BREATHING_MIN_LEVEL` to 1 and back, one
 *   breath every `4 / speed` seconds, starting dim.
 * - `cycle`: with a palette, each colour fades into the next in `2 / speed` seconds and the palette
 *   loops; without one, the base colour's hue turns once every `10 / speed` seconds. Full level.
 */
export function evaluateEffect(
  effect: LightState['effect'],
  baseColor: HexColor,
  t: number,
): LightOutput {
  if (effect.kind === 'static') return { color: baseColor, level: 1 };

  if (effect.kind === 'breathing') {
    const phase = wrap(t, BREATHING_PERIOD_S / effect.speed) / (BREATHING_PERIOD_S / effect.speed);
    const swell = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
    return { color: baseColor, level: BREATHING_MIN_LEVEL + (1 - BREATHING_MIN_LEVEL) * swell };
  }

  const { palette } = effect;
  if (palette && palette.length > 0) {
    const segment = CYCLE_SEGMENT_S / effect.speed;
    const position = wrap(t, segment * palette.length) / segment;
    const index = Math.min(Math.floor(position), palette.length - 1);
    const mix = position - index;
    const from = hexToRgb(palette[index] as string);
    const to = hexToRgb(palette[(index + 1) % palette.length] as string);
    return {
      color: rgbToHex([
        from[0] + (to[0] - from[0]) * mix,
        from[1] + (to[1] - from[1]) * mix,
        from[2] + (to[2] - from[2]) * mix,
      ]),
      level: 1,
    };
  }

  const [hue, saturation, lightness] = toHsl(hexToRgb(baseColor));
  const turn =
    (360 * wrap(t, CYCLE_HUE_PERIOD_S / effect.speed)) / (CYCLE_HUE_PERIOD_S / effect.speed);
  return { color: rgbToHex(fromHsl(hue + turn, saturation, lightness)), level: 1 };
}
