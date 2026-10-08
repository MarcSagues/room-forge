import { describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from './reduced-motion';

const withMedia = (matches: boolean) => ({
  matchMedia: vi.fn((query: string) => ({ matches, media: query }) as MediaQueryList),
});

describe('prefersReducedMotion', () => {
  it('asks the standard media query', () => {
    const target = withMedia(true);
    expect(prefersReducedMotion(target)).toBe(true);
    expect(target.matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
  });

  it('is false when the user did not ask for reduced motion', () => {
    expect(prefersReducedMotion(withMedia(false))).toBe(false);
  });

  it('is false where matchMedia does not exist', () => {
    expect(prefersReducedMotion({} as Pick<Window, 'matchMedia'>)).toBe(false);
  });
});
