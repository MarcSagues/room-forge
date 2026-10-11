'use client';

import { useEffect } from 'react';

/** E2E builds register the worker only where a spec opts in, so no other spec runs under it. */
export const E2E_OPT_IN_KEY = 'roomforge.e2e.serviceWorker';

export interface RegistrationContext {
  production: boolean;
  e2e: boolean;
  supported: boolean;
  optedIn: () => boolean;
}

/** Production builds only (never `next dev`), and in E2E builds only when a spec asks. */
export function shouldRegister(context: RegistrationContext): boolean {
  if (!context.production || !context.supported) return false;
  return !context.e2e || context.optedIn();
}

function optedIn(): boolean {
  try {
    return window.localStorage.getItem(E2E_OPT_IN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Registers the service worker once the page has loaded and the browser is idle: its code is a
 * separate chunk, so it costs the first paint nothing (the /editor/ budget, P7-03).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    const register = shouldRegister({
      production: process.env.NODE_ENV === 'production',
      e2e: process.env.NEXT_PUBLIC_E2E === '1',
      supported: 'serviceWorker' in navigator,
      optedIn,
    });
    if (!register) return;
    let cancelled = false;
    const start = () => {
      if (!cancelled) void import('./register').then((module) => module.startServiceWorker());
    };
    const whenIdle = () => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 5_000 });
      else setTimeout(start, 1_000);
    };
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', whenIdle);
    };
  }, []);
  return null;
}
