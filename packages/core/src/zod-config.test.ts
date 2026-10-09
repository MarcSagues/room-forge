import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

describe('zod without eval', () => {
  const realFunction = globalThis.Function;
  afterEach(() => {
    globalThis.Function = realFunction;
    vi.resetModules();
  });

  it('is configured to use the interpreted parser', async () => {
    await import('./index');
    expect(z.config().jitless).toBe(true);
  });

  it('never asks the engine to compile code, which a strict CSP would report as a violation', async () => {
    vi.resetModules();
    const compiled: unknown[][] = [];
    globalThis.Function = new Proxy(realFunction, {
      construct(target, args, newTarget) {
        compiled.push(args);
        return Reflect.construct(target, args, newTarget);
      },
      apply(target, thisArg, args) {
        compiled.push(args);
        return Reflect.apply(target, thisArg, args);
      },
    });
    const core = await import('./index');
    const { buildDocument } = await import('./testing');
    const result = core.parseProjectValue(
      JSON.parse(
        core.serializeProject(
          { name: 'x', document: buildDocument() },
          { appVersion: 't', exportedAt: '2026-10-09T12:00:00Z' },
        ),
      ),
    );
    expect(result.ok).toBe(true);
    expect(compiled).toEqual([]);
  });
});
