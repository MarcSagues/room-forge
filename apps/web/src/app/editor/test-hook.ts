/**
 * Test hook for Playwright (TESTING_STRATEGY §5). Only builds with `NEXT_PUBLIC_E2E=1` expose
 * `window.__RF__`; production builds never define the variable, so the hook is compiled out.
 * Empty for now: the session and `renderer.info` are added with P2-06.
 */
export type RoomForgeTestHook = Record<string, never>;

declare global {
  interface Window {
    __RF__?: RoomForgeTestHook;
  }
}

export const E2E_ENABLED = process.env.NEXT_PUBLIC_E2E === '1';

export function installTestHook(target: Window, enabled: boolean = E2E_ENABLED): void {
  if (!enabled) return;
  target.__RF__ ??= {};
}
