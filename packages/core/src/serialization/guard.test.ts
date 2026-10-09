import { describe, expect, it } from 'vitest';
import { inspectUntrusted, utf8ByteLength } from './guard';

const OK = { maxDepth: 8, maxNodes: 100 } as const;

describe('inspectUntrusted', () => {
  it('lets plain data through', () => {
    expect(inspectUntrusted({ a: [1, 'two', { b: null }], c: true }, OK)).toBeNull();
    expect(inspectUntrusted([], OK)).toBeNull();
    expect(inspectUntrusted('text', OK)).toBeNull();
    expect(inspectUntrusted(undefined, OK)).toBeNull();
  });

  it('refuses keys that can poison a prototype, wherever they are', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const hostile = JSON.parse(`{"a":[{"${key}":{"x":1}}]}`);
      expect(inspectUntrusted(hostile, OK)).toMatchObject({ reason: 'unsafe-key', detail: key });
    }
  });

  it('refuses data nested deeper than the limit, without recursing', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 100_000; i += 1) deep = [deep];
    expect(inspectUntrusted(deep, OK)).toMatchObject({ reason: 'too-deep' });
  });

  it('refuses a cycle', () => {
    const cyclic: Record<string, unknown> = { a: {} };
    (cyclic.a as Record<string, unknown>).back = cyclic;
    expect(inspectUntrusted(cyclic, { maxDepth: 1000, maxNodes: 1_000_000 })).toMatchObject({
      reason: 'cycle',
    });
    const loop: unknown[] = [];
    loop.push(loop);
    expect(inspectUntrusted(loop, { maxDepth: 1000, maxNodes: 1_000_000 })).toMatchObject({
      reason: 'cycle',
    });
  });

  it('allows the same object to appear twice when it is not a cycle', () => {
    const shared = { x: 1 };
    expect(inspectUntrusted({ a: shared, b: shared }, OK)).toBeNull();
  });

  it('refuses more nodes than the limit, and stops counting there', () => {
    expect(
      inspectUntrusted(
        Array.from({ length: 101 }, () => 0),
        OK,
      ),
    ).toMatchObject({
      reason: 'too-many-nodes',
    });
    const huge = new Array(3_000_000).fill(1);
    const started = Date.now();
    expect(inspectUntrusted(huge, { maxDepth: 8, maxNodes: 1000 })).toMatchObject({
      reason: 'too-many-nodes',
    });
    // It stopped at the limit instead of walking all three million.
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('counts every key and element, not only the containers', () => {
    const wide = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i]));
    expect(inspectUntrusted(wide, OK)).toBeNull();
    expect(
      inspectUntrusted(
        { ...wide, ...Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`j${i}`, i])) },
        OK,
      ),
    ).toMatchObject({ reason: 'too-many-nodes' });
  });
});

describe('utf8ByteLength', () => {
  it('counts bytes, not characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
    expect(utf8ByteLength('')).toBe(0);
  });

  it('copes with a lone surrogate (it is three bytes once replaced)', () => {
    expect(utf8ByteLength('\ud800')).toBe(3);
  });
});
