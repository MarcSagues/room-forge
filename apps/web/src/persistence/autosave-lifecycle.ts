import type { Autosave } from './autosave';

/** The parts of `window` the lifecycle listens to (so a test can pass a lookalike). */
export interface LifecycleTarget {
  addEventListener(type: 'pagehide' | 'beforeunload', listener: (event: Event) => void): void;
  removeEventListener(type: 'pagehide' | 'beforeunload', listener: (event: Event) => void): void;
  readonly document: {
    readonly visibilityState: string;
    addEventListener(type: 'visibilitychange', listener: () => void): void;
    removeEventListener(type: 'visibilitychange', listener: () => void): void;
  };
}

/**
 * What a page going away has to do for the work in it: write at once when the tab is hidden or the
 * page is closed (a `visibilitychange` to hidden is the last reliable moment on phones, `pagehide`
 * on desktop), and, when the last write failed, ask the browser to confirm closing, since that is
 * the one case where closing loses work. Returns how to remove the listeners.
 */
export function installAutosaveLifecycle(autosave: Autosave, target: LifecycleTarget): () => void {
  // The journal first: it is synchronous, so it is the part that lands even if the page dies now.
  const flush = () => {
    autosave.journalNow();
    void autosave.flush();
  };
  const onVisibility = () => {
    if (target.document.visibilityState === 'hidden') flush();
  };
  const onBeforeUnload = (event: Event) => {
    if (autosave.state().status !== 'error') return;
    event.preventDefault();
    // Older browsers read the message from here; modern ones show their own text.
    (event as BeforeUnloadEvent).returnValue = '';
  };
  target.addEventListener('pagehide', flush);
  target.addEventListener('beforeunload', onBeforeUnload);
  target.document.addEventListener('visibilitychange', onVisibility);
  return () => {
    target.removeEventListener('pagehide', flush);
    target.removeEventListener('beforeunload', onBeforeUnload);
    target.document.removeEventListener('visibilitychange', onVisibility);
  };
}
