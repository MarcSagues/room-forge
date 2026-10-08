/** Line segments as flat `[x0,y0,z0, x1,y1,z1, ...]` positions. */
export interface GridLines {
  /** Fine lines (every `minor` metres), without the major ones. */
  readonly minor: Float32Array;
  /** Emphasised lines (every `major` metres, including the room boundary). */
  readonly major: Float32Array;
}

/**
 * Floor grid for the editing view (DESIGN_SYSTEM §4): fine lines every 10 cm, emphasised every
 * metre, over the interior `x ∈ [0, width]`, `z ∈ [0, depth]`.
 */
export function buildGridLines(width: number, depth: number, minor = 0.1, major = 1): GridLines {
  const eps = minor / 1000;
  const isMajor = (value: number) => {
    const r = value % major;
    return r < eps || major - r < eps;
  };
  const along = (extent: number) => {
    const steps = Math.round(extent / minor);
    const values: number[] = [];
    for (let i = 0; i <= steps; i += 1) values.push(Math.min(i * minor, extent));
    if (values[values.length - 1] !== extent) values.push(extent);
    return values;
  };

  const minorPositions: number[] = [];
  const majorPositions: number[] = [];
  const push = (target: number[], x0: number, z0: number, x1: number, z1: number) =>
    target.push(x0, 0, z0, x1, 0, z1);

  for (const x of along(width)) {
    const edge = x === 0 || x === width;
    push(edge || isMajor(x) ? majorPositions : minorPositions, x, 0, x, depth);
  }
  for (const z of along(depth)) {
    const edge = z === 0 || z === depth;
    push(edge || isMajor(z) ? majorPositions : minorPositions, 0, z, width, z);
  }
  return { minor: new Float32Array(minorPositions), major: new Float32Array(majorPositions) };
}
