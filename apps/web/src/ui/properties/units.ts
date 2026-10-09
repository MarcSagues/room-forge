/** The model keeps metres and radians; people read centimetres and degrees (DESIGN_SYSTEM §5.2). */

export const metresToCm = (metres: number): number => metres * 100;
export const cmToMetres = (cm: number): number => cm / 100;

/** A rotation as shown: 0–360°, to a tenth of a degree. */
export function radiansToDegrees(radians: number): number {
  const degrees = ((((radians * 180) / Math.PI) % 360) + 360) % 360;
  const rounded = Math.round(degrees * 10) / 10;
  return rounded === 360 || rounded === 0 ? 0 : rounded;
}

export const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** A value in a field: up to one decimal, no trailing zeros, never `-0`. */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded === 0 ? 0 : rounded);
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** What was typed as a number (a comma works as the decimal separator), or null if it is not one. */
export function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  return NUMBER.test(normalized) ? Number(normalized) : null;
}
