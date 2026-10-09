import type { ChannelLike, LockManagerLike } from '../project-lock';

interface Holder {
  reject: (error: Error) => void;
}

interface Waiter {
  start: () => void;
}

/**
 * Test support: an in-memory `navigator.locks` with the parts the project lock uses (exclusive
 * locks, `ifAvailable`, `steal`, `signal`), shared by every "tab" that is given the same instance.
 */
export function createFakeLockManager(): LockManagerLike & { held(name: string): boolean } {
  const holders = new Map<string, Holder>();
  const queues = new Map<string, Waiter[]>();

  function next(name: string): void {
    const waiter = queues.get(name)?.shift();
    waiter?.start();
  }

  return {
    held: (name) => holders.has(name),
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const grant = () => {
          const holder: Holder = { reject };
          holders.set(name, holder);
          Promise.resolve(callback({ name })).then(
            (value) => {
              if (holders.get(name) !== holder) return;
              holders.delete(name);
              resolve(value);
              next(name);
            },
            (error: Error) => {
              if (holders.get(name) === holder) holders.delete(name);
              reject(error);
              next(name);
            },
          );
        };
        if (options.steal) {
          holders.get(name)?.reject(new Error('AbortError: stolen'));
          holders.delete(name);
          grant();
        } else if (!holders.has(name)) {
          grant();
        } else if (options.ifAvailable) {
          Promise.resolve(callback(null)).then(resolve, reject);
        } else {
          const waiter: Waiter = { start: grant };
          const queue = queues.get(name) ?? [];
          queue.push(waiter);
          queues.set(name, queue);
          options.signal?.addEventListener('abort', () => {
            const index = queue.indexOf(waiter);
            if (index < 0) return;
            queue.splice(index, 1);
            reject(new Error('AbortError: aborted'));
          });
        }
      });
    },
  };
}

/** Test support: `BroadcastChannel`s that deliver to every other open channel of the same name. */
export function createChannelHub(): { open(name: string): ChannelLike } {
  const open = new Set<{ name: string; channel: ChannelLike }>();
  return {
    open(name) {
      const channel: ChannelLike = {
        onmessage: null,
        postMessage(message) {
          const data = structuredClone(message);
          for (const other of open) {
            if (other.channel === channel || other.name !== name) continue;
            queueMicrotask(() => other.channel.onmessage?.({ data }));
          }
        },
        close() {
          for (const entry of open) if (entry.channel === channel) open.delete(entry);
        },
      };
      open.add({ name, channel });
      return channel;
    },
  };
}
