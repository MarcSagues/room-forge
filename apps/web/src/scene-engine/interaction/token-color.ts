/** A colour from the design tokens (CSS custom property), with the dark-theme value as fallback. */
export function tokenColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
