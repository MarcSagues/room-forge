import { describe, expect, it, vi } from 'vitest';
import { systemClock } from '../ports';
import { createEmitter } from './events';

interface TestEvents {
  ping: { n: number };
}

describe('createEmitter', () => {
  it('delivers payloads until a handler unsubscribes', () => {
    const emitter = createEmitter<TestEvents>();
    const handler = vi.fn();
    const off = emitter.on('ping', handler);
    emitter.emit('ping', { n: 1 });
    off();
    emitter.emit('ping', { n: 2 });
    expect(handler).toHaveBeenCalledExactlyOnceWith({ n: 1 });
  });

  it('runs every handler even if one throws, then rethrows the first error', () => {
    const emitter = createEmitter<TestEvents>();
    const after = vi.fn();
    emitter.on('ping', () => {
      throw new Error('first');
    });
    emitter.on('ping', () => {
      throw new Error('second');
    });
    emitter.on('ping', after);
    expect(() => emitter.emit('ping', { n: 1 })).toThrow('first');
    expect(after).toHaveBeenCalledOnce();
  });

  it('ignores events nobody listens to', () => {
    expect(() => createEmitter<TestEvents>().emit('ping', { n: 1 })).not.toThrow();
  });
});

describe('systemClock', () => {
  it('reads the wall clock in milliseconds', () => {
    const before = Date.now();
    expect(systemClock.now()).toBeGreaterThanOrEqual(before);
  });
});
