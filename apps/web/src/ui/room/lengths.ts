export type LengthUnit = 'm' | 'cm';

const PER_METRE: Record<LengthUnit, number> = { m: 1, cm: 100 };

/** Lengths are kept to the millimetre: it is as fine as anyone types, and it hides float noise. */
const toMillimetre = (metres: number) => Math.round(metres * 1000) / 1000;

/**
 * A length typed by a person, in `unit`, as metres to the millimetre; `null` when it is not a
 * number. Accepts a comma as the decimal mark (Spanish keyboards) and spaces around the number.
 */
export function parseLength(text: string, unit: LengthUnit): number | null {
  const clean = text.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(clean)) return null;
  return toMillimetre(Number(clean) / PER_METRE[unit]);
}

/** `metres` as the text of an input in `unit`: at most two decimals in metres, whole in cm. */
export function formatLength(metres: number, unit: LengthUnit): string {
  const shown = unit === 'm' ? Math.round(metres * 100) / 100 : Math.round(metres * 100);
  return String(shown);
}

export type LengthCheck =
  | { ok: true; metres: number }
  | { ok: false; reason: 'empty' | 'nan' | 'min' | 'max' };

/** Whether `text` is a length in `unit` inside `range` (metres), or why not. */
export function checkLength(
  text: string,
  unit: LengthUnit,
  range: { min: number; max: number },
): LengthCheck {
  if (text.trim() === '') return { ok: false, reason: 'empty' };
  const metres = parseLength(text, unit);
  if (metres === null) return { ok: false, reason: 'nan' };
  if (metres < range.min) return { ok: false, reason: 'min' };
  if (metres > range.max) return { ok: false, reason: 'max' };
  return { ok: true, metres };
}
