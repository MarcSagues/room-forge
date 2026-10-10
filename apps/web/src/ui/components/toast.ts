import type { toast as sonnerToast } from 'sonner';

export type Toast = typeof sonnerToast;

/**
 * Toasts load with the first one shown, not with the page: sonner is ≈ 11 kB gzip that no route
 * needs to draw its first frame (P7-04). `notify` asks for it and shows the toast once it is here;
 * the lazy toaster (providers) mounts at the same moment, and sonner replays to it whatever was
 * published before it subscribed.
 */
let loading: Promise<Toast> | null = null;
let wanted = false;
const listeners = new Set<() => void>();

function loadToast(): Promise<Toast> {
  loading ??= import('sonner').then(
    (module) => module.toast,
    (error: unknown) => {
      // A chunk that failed to load (offline, new deploy) is tried again by the next toast.
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** Shows a toast through sonner's API, loading it first if this is the first toast. */
export function notify(show: (toast: Toast) => void): void {
  if (!wanted) {
    wanted = true;
    for (const listener of listeners) listener();
  }
  loadToast().then(show, () => {});
}

/** Whether a toast was asked for yet (the toaster mounts from then on). */
export function toastsWanted(): boolean {
  return wanted;
}

export function subscribeToToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
