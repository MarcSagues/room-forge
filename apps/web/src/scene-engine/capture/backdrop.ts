const TRANSPARENT = /^(transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i;

/** The first opaque-ish background behind `element`, as the page paints it (CSS colour). */
export function readBackdrop(element: Element, fallback = '#000000'): string {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const colour = getComputedStyle(node).backgroundColor.trim();
    if (colour !== '' && !TRANSPARENT.test(colour)) return colour;
  }
  return fallback;
}
