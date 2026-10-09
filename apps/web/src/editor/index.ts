/** Public API of the editor module (bridge between the core session and the UI). */
export { createDemoSession } from './demo-session';
export {
  createErrorLog,
  type ErrorEntry,
  type ErrorLog,
  type ErrorSource,
  installErrorCapture,
  type StorageLike,
} from './error-log';
export { type HotkeyAction, type HotkeyHandlers, installHotkeys, resolveHotkey } from './hotkeys';
