import { afterEach, describe, expect, it } from 'vitest';
import { E2E_ENABLED, installTestHook } from './test-hook';

describe('installTestHook', () => {
  afterEach(() => {
    delete window.__RF__;
  });

  it('is disabled unless the build sets NEXT_PUBLIC_E2E=1', () => {
    expect(E2E_ENABLED).toBe(false);
    installTestHook(window);
    expect(window.__RF__).toBeUndefined();
  });

  it('exposes window.__RF__ in E2E builds', () => {
    installTestHook(window, true);
    expect(window.__RF__).toEqual({});
  });
});
