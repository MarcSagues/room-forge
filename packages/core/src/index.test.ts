import { describe, expect, it } from 'vitest';
import { CORE_PACKAGE_NAME } from './index';

describe('@roomforge/core entry point', () => {
  it('exposes the package name used to prove the workspace wiring', () => {
    expect(CORE_PACKAGE_NAME).toBe('@roomforge/core');
  });
});
