import type { LightQuality } from '@roomforge/core';

export interface GraphicsProfile {
  /** Size of the light pool (P5-05). */
  quality: LightQuality;
  /** Highest device pixel ratio the canvas renders at. */
  maxDpr: number;
}

/** Desktops and laptops: medium quality (until P5-10's setting), up to 2× pixels. */
export const DESKTOP_PROFILE: GraphicsProfile = { quality: 'medium', maxDpr: 2 };

/**
 * Phones and tablets (P7-06): the low pool and at most 1.5× pixels. A 3× phone screen would
 * otherwise shade four times the pixels of 1.5× on a much weaker GPU; at arm's length 1.5× still
 * looks sharp.
 */
export const TOUCH_PROFILE: GraphicsProfile = { quality: 'low', maxDpr: 1.5 };

/** A finger is the main pointer and nothing hovers: a phone or a tablet. */
export const TOUCH_DEVICE_QUERY = '(pointer: coarse) and (hover: none)';

/**
 * Read once when the canvas mounts, from the kind of device rather than the window's width, so
 * turning a phone or resizing a window never rebuilds the light pool.
 */
export function detectGraphicsProfile(
  matchMedia: ((query: string) => { matches: boolean }) | undefined,
): GraphicsProfile {
  return matchMedia?.(TOUCH_DEVICE_QUERY).matches ? TOUCH_PROFILE : DESKTOP_PROFILE;
}
