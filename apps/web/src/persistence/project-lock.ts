import type { ProjectId } from '@roomforge/core';
import { type Scheduler, systemScheduler } from './autosave';

/** The part of `navigator.locks` this needs; injectable so tests do not depend on a browser. */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<void> | void,
  ): Promise<unknown>;
}

/** The part of a `BroadcastChannel` this needs. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

/** `owner` may edit and save; `reader` only looks (another tab owns the project). */
export type LockRole = 'pending' | 'owner' | 'reader';

export interface ProjectLockOptions {
  projectId: ProjectId;
  /** `navigator.locks`; without it the tabs agree over the channel alone. */
  locks?: LockManagerLike | undefined;
  /** Opens a `BroadcastChannel`; without both it and `locks` every tab owns (nothing to agree on). */
  openChannel?: ((name: string) => ChannelLike | undefined) | undefined;
  scheduler?: Scheduler;
  /** How long a take-over waits for the owner to hand over before taking the project anyway. */
  handoverMs?: number;
  /** Without Web Locks: how long a new tab waits for an owner to answer before owning. */
  probeMs?: number;
  /**
   * Called on the owner when another tab takes over, before letting go: write what is pending.
   * The role turns `reader` once it settles (or fails: the other tab is waiting).
   */
  onHandover?: () => Promise<void>;
}

export interface ProjectLock {
  role(): LockRole;
  /** Calls `listener` with every new role. */
  subscribe(listener: (role: LockRole) => void): () => void;
  /**
   * Asks the owner to hand over and becomes the owner when it has (or after `handoverMs`, if it
   * does not answer). The caller then reloads the project: the owner may have changed it.
   */
  takeOver(): Promise<void>;
  /** Lets go of the lock and the channel. */
  dispose(): void;
}

type Message = { type: 'probe' | 'owned' | 'release' | 'released' };

const MESSAGE_TYPES = new Set(['probe', 'owned', 'release', 'released']);

/** Messages come from other tabs: anything but the four known shapes is ignored. */
function isMessage(data: unknown): data is Message {
  return (
    typeof data === 'object' &&
    data !== null &&
    MESSAGE_TYPES.has((data as { type?: unknown }).type as string)
  );
}

export const projectLockName = (projectId: string) => `roomforge.project.${projectId}`;

/**
 * One editing tab per project (P6-09, RISKS R5): two tabs autosaving the same project would
 * overwrite each other's work. The first tab owns the project (an exclusive Web Lock, held while
 * the editor is open); a later one is a reader. "Take over" asks the owner over a
 * `BroadcastChannel` to write what is pending and let go, waits for the lock, and steals it if the
 * owner does not answer in time (a frozen tab). Without Web Locks the channel alone decides: a new
 * tab asks whether anyone owns the project and owns it if nobody answers (two tabs starting in the
 * same instant may both own: the fallback is best effort).
 */
export function createProjectLock(options: ProjectLockOptions): ProjectLock {
  const {
    projectId,
    locks,
    openChannel,
    scheduler = systemScheduler,
    handoverMs = 3_000,
    probeMs = 300,
    onHandover = async () => {},
  } = options;
  const name = projectLockName(projectId);
  const channel = openChannel?.(name);
  const listeners = new Set<(role: LockRole) => void>();
  let role: LockRole = 'pending';
  let disposed = false;
  let handingOver = false;
  /** Lets go of the Web Lock this tab holds. */
  let releaseHeld: (() => void) | undefined;
  /** Without Web Locks: settles a probe or a take-over when the owner answers. */
  let answered: ((type: Message['type']) => void) | undefined;
  const timers = new Set<unknown>();

  function set(next: LockRole): void {
    if (disposed || next === role) return;
    role = next;
    for (const listener of [...listeners]) listener(role);
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = scheduler.setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, ms);
      timers.add(timer);
    });
  }

  function post(type: Message['type']): void {
    try {
      channel?.postMessage({ type });
    } catch {
      // A closed channel: the other tabs fall back on the lock or the timeout.
    }
  }

  /** Holds the lock until `releaseHeld`; resolves `true` once it is granted, `false` if not. */
  function hold(lockOptions: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal }) {
    return new Promise<boolean>((granted) => {
      locks
        ?.request(name, lockOptions, (lock) => {
          if (!lock || disposed) {
            granted(false);
            return;
          }
          granted(true);
          return new Promise<void>((release) => {
            releaseHeld = release;
          });
        })
        .catch(() => {
          // Aborted (the take-over timed out), or stolen by a tab that took over without an answer.
          granted(false);
          if (role === 'owner' && !handingOver) set('reader');
        });
    });
  }

  async function handOver(): Promise<void> {
    if (role !== 'owner' || handingOver) return;
    handingOver = true;
    try {
      await onHandover();
    } catch {
      // The other tab is taking over anyway; what could not be written is in the journal.
    }
    set('reader');
    releaseHeld?.();
    releaseHeld = undefined;
    handingOver = false;
    post('released');
  }

  if (channel) {
    channel.onmessage = (event) => {
      if (disposed || !isMessage(event.data)) return;
      const { type } = event.data;
      if (type === 'probe' && role === 'owner' && !locks) post('owned');
      else if (type === 'release') void handOver();
      else answered?.(type);
    };
  }

  /** Without Web Locks: waits up to `ms` for a reply of the given type. */
  async function answer(type: Message['type'], ms: number): Promise<boolean> {
    let heard = false;
    const reply = new Promise<void>((resolve) => {
      answered = (received) => {
        if (received !== type) return;
        heard = true;
        resolve();
      };
    });
    await Promise.race([reply, wait(ms)]);
    answered = undefined;
    return heard;
  }

  async function start(): Promise<void> {
    if (locks) {
      set((await hold({ ifAvailable: true })) ? 'owner' : 'reader');
    } else if (channel) {
      post('probe');
      set((await answer('owned', probeMs)) ? 'reader' : 'owner');
    } else {
      set('owner');
    }
  }

  async function takeOver(): Promise<void> {
    if (role === 'owner' || disposed) return;
    post('release');
    if (locks) {
      const controller = new AbortController();
      const timer = scheduler.setTimeout(() => controller.abort(), handoverMs);
      const handedOver = await hold({ signal: controller.signal });
      scheduler.clearTimeout(timer);
      if (!handedOver) await hold({ steal: true });
    } else if (channel) {
      await answer('released', handoverMs);
    }
    set('owner');
  }

  void start();

  return {
    role: () => role,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    takeOver,
    dispose() {
      disposed = true;
      releaseHeld?.();
      releaseHeld = undefined;
      for (const timer of timers) scheduler.clearTimeout(timer);
      timers.clear();
      listeners.clear();
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
    },
  };
}

/** The browser's Web Locks and `BroadcastChannel`, where it has them. */
export function browserLockApis(): Pick<ProjectLockOptions, 'locks' | 'openChannel'> {
  const locks =
    typeof navigator !== 'undefined' && navigator.locks
      ? (navigator.locks as unknown as LockManagerLike)
      : undefined;
  const openChannel =
    typeof BroadcastChannel === 'function'
      ? (name: string) => new BroadcastChannel(name) as unknown as ChannelLike
      : undefined;
  return { locks, openChannel };
}
