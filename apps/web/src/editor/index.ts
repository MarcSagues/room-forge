/** Public API of the editor module (bridge between the core session and the UI). */
export { createDemoSession } from './demo-session';
export { type EditorShortcutDeps, editorShortcuts } from './shortcuts/editor-shortcuts';
export {
  createShortcutRegistry,
  detectMac,
  formatCombo,
  isTypingTarget,
  type KeyCombo,
  type ShortcutDef,
  type ShortcutRegistry,
} from './shortcuts/registry';
