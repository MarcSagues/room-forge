/** Widgets that use the arrow keys or letters themselves; while one has focus, shortcuts stand back. */
const KEY_WIDGETS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="spinbutton"], [role="tablist"], [role="menu"], [role="menubar"], [role="listbox"], [role="radiogroup"], [role="tree"], [role="grid"], [role="dialog"]';

/** True when the key event came from a focused widget that handles keys on its own. */
export function widgetOwnsKeys(target: EventTarget | null): boolean {
  const element = target as Partial<Element> | null;
  return element?.closest?.(KEY_WIDGETS) != null;
}
