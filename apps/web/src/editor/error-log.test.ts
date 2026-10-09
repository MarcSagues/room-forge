import { describe, expect, it, vi } from 'vitest';
import {
  createErrorLog,
  ERROR_LOG_KEY,
  ERROR_LOG_LIMIT,
  installErrorCapture,
  type StorageLike,
} from './error-log';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
  return { storage, data };
}

let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 9, 12, 0, tick++)).toISOString();

describe('createErrorLog: recording', () => {
  it('records an Error with its message, stack, source and place', () => {
    const log = createErrorLog({ now });
    log.record(new TypeError('boom'), { source: 'react', where: 'Properties panel' });
    const [entry] = log.entries();
    expect(entry).toMatchObject({
      source: 'react',
      where: 'Properties panel',
      message: 'TypeError: boom',
    });
    expect(entry?.stack).toContain('boom');
    expect(entry?.time).toMatch(/^2026-10-09T12:00:\d\dZ$|^2026-10-09T12:00:\d\d\.\d{3}Z$/);
  });

  it('copes with anything that can be thrown', () => {
    const log = createErrorLog({ now });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const thrown of [
      'text',
      42,
      null,
      undefined,
      { message: 'from an object' },
      cyclic,
      Symbol('s'),
    ]) {
      expect(() => log.record(thrown)).not.toThrow();
    }
    const messages = log.entries().map((entry) => entry.message);
    expect(messages).toContain('text');
    expect(messages).toContain('42');
    expect(messages).toContain('from an object');
    expect(log.entries()).toHaveLength(7);
    for (const entry of log.entries()) expect(typeof entry.message).toBe('string');
  });

  it('keeps messages and stacks short', () => {
    const log = createErrorLog({ now });
    const error = new Error('x'.repeat(5000));
    error.stack = Array.from({ length: 100 }, (_, i) => `    at frame${i} (file.js:1:1)`).join(
      '\n',
    );
    log.record(error);
    const [entry] = log.entries();
    expect(entry?.message.length).toBeLessThanOrEqual(500);
    expect((entry?.stack ?? '').split('\n').length).toBeLessThanOrEqual(20);
    expect((entry?.stack ?? '').length).toBeLessThanOrEqual(4000);
  });

  it('keeps only the last 50, dropping the oldest', () => {
    const log = createErrorLog({ now });
    for (let i = 0; i < ERROR_LOG_LIMIT + 7; i += 1) log.record(new Error(`error ${i}`));
    const entries = log.entries();
    expect(entries).toHaveLength(ERROR_LOG_LIMIT);
    expect(entries[0]?.message).toBe('Error: error 7');
    expect(entries.at(-1)?.message).toBe(`Error: error ${ERROR_LOG_LIMIT + 6}`);
  });

  it('can be cleared', () => {
    const log = createErrorLog({ now });
    log.record(new Error('a'));
    log.clear();
    expect(log.entries()).toEqual([]);
  });
});

describe('createErrorLog: storage', () => {
  it('persists entries and finds them again in a new session', () => {
    const { storage } = memoryStorage();
    const first = createErrorLog({ storage, now });
    first.record(new Error('before the crash'), { source: 'window' });
    const second = createErrorLog({ storage, now });
    expect(second.entries().map((entry) => entry.message)).toEqual(['Error: before the crash']);
    second.clear();
    expect(createErrorLog({ storage }).entries()).toEqual([]);
  });

  it('ignores a corrupted or foreign record in storage', () => {
    for (const raw of ['not json', '{"a":1}', '[1,2,3]', '[{"message":5}]', 'null']) {
      const { storage } = memoryStorage({ [ERROR_LOG_KEY]: raw });
      expect(createErrorLog({ storage }).entries(), raw).toEqual([]);
    }
  });

  it('keeps going when storage is full, blocked or throws', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const log = createErrorLog({ storage, now });
    expect(() => log.record(new Error('still recorded'))).not.toThrow();
    expect(log.entries()).toHaveLength(1);
    expect(() => log.clear()).not.toThrow();
  });

  it('caps what it reads back too', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      time: 't',
      source: 'react',
      message: `m${i}`,
    }));
    const { storage } = memoryStorage({ [ERROR_LOG_KEY]: JSON.stringify(many) });
    const entries = createErrorLog({ storage }).entries();
    expect(entries).toHaveLength(ERROR_LOG_LIMIT);
    expect(entries.at(-1)?.message).toBe('m199');
  });
});

describe('createErrorLog: the downloadable report', () => {
  it('lists every entry, oldest first, and says it holds no project data', () => {
    const log = createErrorLog({ now });
    log.record(new Error('first'), { source: 'react', where: 'Catalog panel' });
    log.record('second', { source: 'webgl' });
    const text = log.toText({ app: 'RoomForge 0.1.0' });
    expect(text).toContain('RoomForge 0.1.0');
    expect(text).toMatch(/does not contain your project/i);
    expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'));
    expect(text).toContain('[react] Catalog panel');
    expect(text).toContain('[webgl]');
  });

  it('says so when there is nothing in it', () => {
    expect(createErrorLog({ now }).toText()).toMatch(/no errors/i);
  });
});

describe('installErrorCapture', () => {
  function fakeWindow() {
    const listeners = new Map<string, (event: unknown) => void>();
    return {
      target: {
        addEventListener: (type: string, listener: (event: unknown) => void) =>
          void listeners.set(type, listener),
        removeEventListener: (type: string) => void listeners.delete(type),
      } as unknown as Window,
      fire: (type: string, event: unknown) => listeners.get(type)?.(event),
      count: () => listeners.size,
    };
  }

  it('records uncaught errors and unhandled rejections, and stops when told to', () => {
    const log = createErrorLog({ now });
    const win = fakeWindow();
    const stop = installErrorCapture(win.target, log);
    win.fire('error', { error: new Error('uncaught'), message: 'ignored' });
    win.fire('error', { error: undefined, message: 'Script error.' });
    win.fire('unhandledrejection', { reason: new Error('promise') });
    expect(log.entries().map((entry) => [entry.source, entry.message])).toEqual([
      ['window', 'Error: uncaught'],
      ['window', 'Script error.'],
      ['promise', 'Error: promise'],
    ]);
    stop();
    expect(win.count()).toBe(0);
  });

  it('never lets recording an error throw an error', () => {
    const broken = {
      record: vi.fn(() => {
        throw new Error('log is broken');
      }),
    } as never;
    const win = fakeWindow();
    installErrorCapture(win.target, broken);
    expect(() => win.fire('error', { error: new Error('x') })).not.toThrow();
  });
});
