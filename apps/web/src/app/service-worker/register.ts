import { showUpdateAvailable } from '@/ui';
import { runBeforeReload } from './before-reload';

/** How often a long editing session asks whether a new version is out. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export interface ServiceWorkerOptions {
  container: ServiceWorkerContainer;
  /** Shows the "update available" prompt; `onReload` runs when the person accepts it. */
  showUpdate: (actions: { onReload: () => void }) => void;
  /** Runs before the reload (the autosave flush). */
  beforeReload: () => Promise<void>;
  reload: () => void;
  setInterval?: (callback: () => void, ms: number) => unknown;
}

/**
 * Registers `/sw.js` and wires the update flow (P8-05): a new worker installs next to the old one
 * and waits; the page offers to reload; only when the person accepts, it saves, tells the worker to
 * take over and reloads once it has. Another tab taking over never reloads this one.
 */
export async function registerServiceWorker(
  options: ServiceWorkerOptions,
): Promise<ServiceWorkerRegistration | null> {
  const { container } = options;
  let registration: ServiceWorkerRegistration;
  try {
    registration = await container.register('/sw.js', { scope: '/' });
  } catch {
    return null; // No worker means no offline copy, nothing worse.
  }

  let accepted = false;
  container.addEventListener('controllerchange', () => {
    if (accepted) options.reload();
  });

  const offer = (worker: ServiceWorker) => {
    // The very first worker is not an update: the page already runs the version it installs.
    if (!container.controller) return;
    options.showUpdate({
      onReload: () => {
        void options.beforeReload().then(() => {
          // Another tab may have switched to it already: then there is nothing to wait for.
          if (worker.state === 'activated') {
            options.reload();
            return;
          }
          accepted = true;
          worker.postMessage({ type: 'SKIP_WAITING' });
        });
      },
    });
  };

  if (registration.waiting) offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer(worker);
    });
  });

  (options.setInterval ?? setInterval)(() => {
    registration.update().catch(() => {});
  }, UPDATE_CHECK_MS);
  return registration;
}

/** The browser's wiring of `registerServiceWorker`. */
export function startServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  return registerServiceWorker({
    container: navigator.serviceWorker,
    showUpdate: showUpdateAvailable,
    beforeReload: () => runBeforeReload(),
    reload: () => window.location.reload(),
  });
}
