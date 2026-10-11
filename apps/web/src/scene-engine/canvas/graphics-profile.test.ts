import { describe, expect, it } from 'vitest';
import {
  DESKTOP_PROFILE,
  detectGraphicsProfile,
  TOUCH_DEVICE_QUERY,
  TOUCH_PROFILE,
} from './graphics-profile';

describe('detectGraphicsProfile', () => {
  it('uses the low pool and a lower pixel ratio on touch devices', () => {
    const asked: string[] = [];
    const profile = detectGraphicsProfile((query) => {
      asked.push(query);
      return { matches: true };
    });
    expect(profile).toBe(TOUCH_PROFILE);
    expect(profile).toEqual({ quality: 'low', maxDpr: 1.5 });
    expect(asked).toEqual([TOUCH_DEVICE_QUERY]);
  });

  it('keeps the desktop profile otherwise, or without matchMedia', () => {
    expect(detectGraphicsProfile(() => ({ matches: false }))).toBe(DESKTOP_PROFILE);
    expect(detectGraphicsProfile(undefined)).toBe(DESKTOP_PROFILE);
  });
});
