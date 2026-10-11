import { describe, expect, it, vi } from 'vitest';
import { beforeReload, runBeforeReload } from './before-reload';
import { registerServiceWorker, type ServiceWorkerOptions } from './register';
import { shouldRegister } from './service-worker-registrar';

/** A worker with a state and the messages it was sent. */
class FakeWorker extends EventTarget {
  messages: unknown[] = [];
  constructor(public state: ServiceWorkerState) {
    super();
  }
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  become(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(async () => {});
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null;
  registration = new FakeRegistration();
  register = vi.fn(async () => this.registration);
  constructor(controlled: boolean) {
    super();
    this.controller = controlled ? new FakeWorker('activated') : null;
  }
}

function setup(controlled = true, overrides: Partial<ServiceWorkerOptions> = {}) {
  const container = new FakeContainer(controlled);
  const prompts: Array<() => void> = [];
  const options = {
    container: container as unknown as ServiceWorkerContainer,
    showUpdate: ({ onReload }: { onReload: () => void }) => prompts.push(onReload),
    beforeReload: vi.fn(async () => {}),
    reload: vi.fn(),
    setInterval: vi.fn(),
    ...overrides,
  };
  return { container, prompts, options };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('registerServiceWorker', () => {
  it('registers /sw.js for the whole site and checks for updates now and then', async () => {
    const { container, options } = setup();
    await registerServiceWorker(options);
    expect(container.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(options.setInterval).toHaveBeenCalledWith(expect.any(Function), 3_600_000);
  });

  it('a registration that fails leaves the page as it is', async () => {
    const { container, options } = setup();
    container.register.mockRejectedValueOnce(new Error('insecure'));
    expect(await registerServiceWorker(options)).toBeNull();
  });

  it('the first worker installs silently: it is not an update', async () => {
    const { container, prompts, options } = setup(false);
    await registerServiceWorker(options);
    const worker = new FakeWorker('installing');
    container.registration.installing = worker;
    container.registration.dispatchEvent(new Event('updatefound'));
    worker.become('installed');
    expect(prompts).toHaveLength(0);
  });

  it('a new version offers a reload and never reloads by itself', async () => {
    const { container, prompts, options } = setup();
    await registerServiceWorker(options);
    const worker = new FakeWorker('installing');
    container.registration.installing = worker;
    container.registration.dispatchEvent(new Event('updatefound'));
    worker.become('installed');
    expect(prompts).toHaveLength(1);
    expect(worker.messages).toEqual([]);

    // Another tab switching versions does not reload this one.
    container.dispatchEvent(new Event('controllerchange'));
    expect(options.reload).not.toHaveBeenCalled();
  });

  it('accepting saves first, then lets the worker take over, then reloads', async () => {
    const order: string[] = [];
    const { container, prompts, options } = setup(true, {
      beforeReload: async () => {
        order.push('saved');
      },
      reload: () => order.push('reloaded'),
    });
    const waiting = new FakeWorker('installed');
    container.registration.waiting = waiting;
    await registerServiceWorker(options);
    expect(prompts).toHaveLength(1);

    prompts[0]?.();
    await flush();
    expect(order).toEqual(['saved']);
    expect(waiting.messages).toEqual([{ type: 'SKIP_WAITING' }]);
    container.dispatchEvent(new Event('controllerchange'));
    expect(order).toEqual(['saved', 'reloaded']);
  });

  it('reloads at once if another tab already switched to the new version', async () => {
    const { container, prompts, options } = setup();
    const waiting = new FakeWorker('installed');
    container.registration.waiting = waiting;
    await registerServiceWorker(options);
    waiting.state = 'activated';
    prompts[0]?.();
    await flush();
    expect(options.reload).toHaveBeenCalledTimes(1);
    expect(waiting.messages).toEqual([]);
  });
});

describe('runBeforeReload', () => {
  it('waits for every task, and a task can be removed', async () => {
    const done: string[] = [];
    const removeA = beforeReload(async () => {
      done.push('a');
    });
    const removeB = beforeReload(async () => {
      done.push('b');
    });
    removeA();
    await runBeforeReload();
    expect(done).toEqual(['b']);
    removeB();
  });

  it('a task that hangs does not keep the page from reloading', async () => {
    vi.useFakeTimers();
    const remove = beforeReload(() => new Promise(() => {}));
    const run = runBeforeReload(3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(run).resolves.toBeUndefined();
    remove();
    vi.useRealTimers();
  });
});

describe('shouldRegister', () => {
  const base = { production: true, e2e: false, supported: true, optedIn: () => false };

  it('registers in production builds only, where the browser supports it', () => {
    expect(shouldRegister(base)).toBe(true);
    expect(shouldRegister({ ...base, production: false })).toBe(false);
    expect(shouldRegister({ ...base, supported: false })).toBe(false);
  });

  it('E2E builds register only when a spec opts in', () => {
    expect(shouldRegister({ ...base, e2e: true })).toBe(false);
    expect(shouldRegister({ ...base, e2e: true, optedIn: () => true })).toBe(true);
  });
});
