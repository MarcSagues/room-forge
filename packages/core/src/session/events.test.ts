import { describe, expect, it, vi } from 'vitest';
import { systemClock } from '../ports';
import { createEmitter } from './events';

interface TestEvents {
  ping: { n: number };
  pong: { ok: boolean };
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

  describe('listenerCount (leak checks)', () => {
    it('counts handlers per event and in total', () => {
      const emitter = createEmitter<TestEvents>();
      expect(emitter.listenerCount()).toBe(0);
      emitter.on('ping', () => {});
      emitter.on('ping', () => {});
      emitter.on('pong', () => {});
      expect(emitter.listenerCount('ping')).toBe(2);
      expect(emitter.listenerCount('pong')).toBe(1);
      expect(emitter.listenerCount()).toBe(3);
    });

    it('goes back to zero after every handler unsubscribes', () => {
      const emitter = createEmitter<TestEvents>();
      const offs = [emitter.on('ping', () => {}), emitter.on('pong', () => {})];
      for (const off of offs) off();
      expect(emitter.listenerCount()).toBe(0);
    });

    it('unsubscribing twice is harmless and does not drop other handlers', () => {
      const emitter = createEmitter<TestEvents>();
      const keep = vi.fn();
      const off = emitter.on('ping', () => {});
      emitter.on('ping', keep);
      off();
      off();
      expect(emitter.listenerCount('ping')).toBe(1);
      emitter.emit('ping', { n: 1 });
      expect(keep).toHaveBeenCalledOnce();
    });

    it('does not accumulate state across many subscribe/unsubscribe cycles', () => {
      const emitter = createEmitter<TestEvents>();
      for (let i = 0; i < 1000; i += 1) emitter.on('ping', () => {})();
      expect(emitter.listenerCount()).toBe(0);
    });

    it('a handler can unsubscribe itself while the event is being delivered', () => {
      const emitter = createEmitter<TestEvents>();
      const later = vi.fn();
      const off = emitter.on('ping', () => off());
      emitter.on('ping', later);
      emitter.emit('ping', { n: 1 });
      emitter.emit('ping', { n: 2 });
      expect(emitter.listenerCount('ping')).toBe(1);
      expect(later).toHaveBeenCalledTimes(2);
    });
  });
});

describe('systemClock', () => {
  it('reads the wall clock in milliseconds', () => {
    const before = Date.now();
    expect(systemClock.now()).toBeGreaterThanOrEqual(before);
  });
});
