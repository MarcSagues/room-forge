import { BufferGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createModelRegistry, type ModelPart } from './model-registry';

/** A loader whose loads the test settles by hand. */
function fakeLoader() {
  const pending = new Map<string, { resolve(parts: ModelPart[]): void; reject(e: Error): void }>();
  const load = vi.fn(
    (url: string) =>
      new Promise<ModelPart[]>((resolve, reject) => pending.set(url, { resolve, reject })),
  );
  const parts = () =>
    ['top', 'frame', 'accent'].map((slot) => ({ slot, geometry: new BufferGeometry() }));
  return {
    load,
    resolve(url: string) {
      const made = parts();
      pending.get(url)?.resolve(made);
      return made;
    },
    reject: (url: string) => pending.get(url)?.reject(new Error('404')),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createModelRegistry', () => {
  it('loads a model once however many objects use it, and tells each one when it is ready', async () => {
    const loader = fakeLoader();
    const onChange = vi.fn();
    const registry = createModelRegistry({ load: loader.load, onChange });
    const first = vi.fn();
    const a = registry.acquire('/a.glb', first);
    const b = registry.acquire('/a.glb', vi.fn());
    expect(a.snapshot().status).toBe('loading');
    expect(loader.load).toHaveBeenCalledTimes(1);

    const parts = loader.resolve('/a.glb');
    await settle();
    expect(a.snapshot()).toEqual({ status: 'ready', parts });
    expect(b.snapshot().parts).toBe(parts); // the same geometries: shared, never copied
    expect(first).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1); // one frame for the scene to show it
    expect(registry.stats()).toEqual({ models: 1, leases: 2, geometries: 3 });
  });

  it('frees the geometries when the last user lets go, and not before', async () => {
    const loader = fakeLoader();
    const registry = createModelRegistry({ load: loader.load });
    const a = registry.acquire('/a.glb', vi.fn());
    const b = registry.acquire('/a.glb', vi.fn());
    const parts = loader.resolve('/a.glb');
    await settle();
    const disposed = parts.map((part) => vi.spyOn(part.geometry, 'dispose'));

    a.release();
    await settle();
    expect(disposed.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    b.release();
    b.release(); // twice is harmless
    await settle();
    expect(disposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(registry.stats()).toEqual({ models: 0, leases: 0, geometries: 0 });
  });

  it('keeps the model through a release and acquire in the same tick (a remount)', async () => {
    const loader = fakeLoader();
    const registry = createModelRegistry({ load: loader.load });
    registry.acquire('/a.glb', vi.fn()).release();
    const again = registry.acquire('/a.glb', vi.fn());
    loader.resolve('/a.glb');
    await settle();
    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(again.snapshot().status).toBe('ready');
  });

  it('frees a model that arrives after everybody let go, and loads it again when asked', async () => {
    const loader = fakeLoader();
    const registry = createModelRegistry({ load: loader.load });
    registry.acquire('/a.glb', vi.fn()).release();
    await settle();
    const late = loader.resolve('/a.glb');
    const disposed = late.map((part) => vi.spyOn(part.geometry, 'dispose'));
    await settle();
    expect(disposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(registry.stats().models).toBe(0);

    registry.acquire('/a.glb', vi.fn());
    expect(loader.load).toHaveBeenCalledTimes(2);
  });

  it('reports a failed load and retries it once nobody holds the failure', async () => {
    const loader = fakeLoader();
    const onChange = vi.fn();
    const registry = createModelRegistry({ load: loader.load, onChange });
    const listener = vi.fn();
    const lease = registry.acquire('/missing.glb', listener);
    loader.reject('/missing.glb');
    await settle();
    expect(lease.snapshot()).toEqual({ status: 'error', parts: null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    lease.release();
    await settle();
    registry.acquire('/missing.glb', vi.fn());
    expect(loader.load).toHaveBeenCalledTimes(2);
  });

  it('does not grow when objects come and go 200 times', async () => {
    const loader = fakeLoader();
    const registry = createModelRegistry({ load: loader.load });
    const keep = registry.acquire('/a.glb', vi.fn());
    loader.resolve('/a.glb');
    await settle();
    for (let i = 0; i < 200; i += 1) registry.acquire('/a.glb', vi.fn()).release();
    await settle();
    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(registry.stats()).toEqual({ models: 1, leases: 1, geometries: 3 });
    keep.release();
  });

  it('frees everything on dispose, including loads still on their way', async () => {
    const loader = fakeLoader();
    const listener = vi.fn();
    const registry = createModelRegistry({ load: loader.load });
    registry.acquire('/a.glb', vi.fn());
    const lease = registry.acquire('/b.glb', listener);
    const parts = loader.resolve('/a.glb');
    await settle();
    const disposed = parts.map((part) => vi.spyOn(part.geometry, 'dispose'));
    registry.dispose();
    expect(disposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    const late = loader.resolve('/b.glb');
    const lateDisposed = late.map((part) => vi.spyOn(part.geometry, 'dispose'));
    await settle();
    expect(lateDisposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    lease.release();
    expect(registry.stats()).toEqual({ models: 0, leases: 0, geometries: 0 });
  });
});
