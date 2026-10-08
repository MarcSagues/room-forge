export type Mutate = <T>(fn: () => T) => T;

/**
 * Direct three.js mutations (moving an `Object3D`, changing a material colour) are invisible to
 * React, so under `frameloop="demand"` the canvas would keep showing the old frame. `mutate`
 * runs the mutation and then requests a frame, even if the mutation throws half-way.
 */
export function createMutate(invalidate: () => void): Mutate {
  return (fn) => {
    try {
      return fn();
    } finally {
      invalidate();
    }
  };
}
