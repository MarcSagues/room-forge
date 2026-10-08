export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the user asked the system for less motion: camera moves then cut instead of animating. */
export function prefersReducedMotion(
  target: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined'
    ? undefined
    : window,
): boolean {
  return (
    typeof target?.matchMedia === 'function' && target.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}
