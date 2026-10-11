/**
 * What has to happen before the page reloads into a new version (P8-05): the editor adds its
 * autosave flush here, so accepting an update never drops the last edits. Kept apart from the
 * registration so the editor can add to it without loading the service worker code.
 */
const tasks = new Set<() => Promise<void>>();

/** Adds a task; returns how to remove it. */
export function beforeReload(task: () => Promise<void>): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
}

/**
 * Runs every task, and gives up waiting after `timeoutMs`: a write that hangs must not keep the
 * page from reloading (the autosave journal and `pagehide` still cover the last edits).
 */
export async function runBeforeReload(timeoutMs = 3_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  const all = Promise.allSettled([...tasks].map((task) => task())).then(() => {});
  await Promise.race([all, timeout]);
  clearTimeout(timer);
}
