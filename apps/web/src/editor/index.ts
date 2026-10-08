/** Public API of the editor module (bridge between the core session and the UI). */
export { createDemoSession } from './demo-session';
export { type HotkeyAction, type HotkeyHandlers, installHotkeys, resolveHotkey } from './hotkeys';
