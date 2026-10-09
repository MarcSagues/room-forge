import type { HexColor } from '@roomforge/core';

/**
 * A colour typed by a person as `#rrggbb`: with or without the `#`, three or six digits, any
 * case, spaces around. Returns the stored form (`#rrggbb`, lower case) or `null` when it is not a
 * colour, so a typo changes nothing.
 */
export function parseHexColor(input: string): HexColor | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  const digits = match?.[1]?.toLowerCase();
  if (!digits) return null;
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  return `#${full}`;
}
