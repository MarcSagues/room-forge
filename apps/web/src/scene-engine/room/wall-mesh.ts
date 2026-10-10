import type { MeshData } from './mesh-data';

/** Rectangular opening in wall-local metres: `u` along the wall, `v` up from the floor. */
export interface WallHole {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
}

const EPS = 1e-6;

/** Axis a face is perpendicular to. The other two axes run `p` and `q` (see `rect`). */
type Axis = 0 | 1 | 2;
/** For each axis: the axes `p` and `q` span, and the normal sign of the corner order p→q. */
const SPAN: Readonly<Record<Axis, readonly [Axis, Axis, 1 | -1]>> = {
  0: [2, 1, -1],
  1: [0, 2, -1],
  2: [0, 1, 1],
};
const ORDER_FRONT = [0, 1, 2, 3] as const;
const ORDER_BACK = [0, 3, 2, 1] as const;
const CORNER_P = [0, 1, 1, 0] as const;
const CORNER_Q = [0, 0, 1, 1] as const;

/**
 * Writes a wall mesh into typed arrays it owns, without allocating once built: `buildWallMesh`
 * uses one per wall, and a dragged opening rewrites the same buffers every frame. `maxHoles`
 * bounds the buffers.
 */
export class WallMeshWriter {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  vertexCount = 0;
  indexCount = 0;
  /** Sorted, distinct grid lines along the wall and up it. */
  private readonly us: Float64Array;
  private readonly vs: Float64Array;
  private nu = 0;
  private nv = 0;
  private readonly corner = [0, 0, 0];

  constructor(maxHoles: number) {
    const lines = 2 + 2 * maxHoles;
    const cells = (lines - 1) * (lines - 1);
    const quads = 2 * cells + 2 * (lines - 1) + 2 + 4 * maxHoles;
    this.positions = new Float32Array(quads * 12);
    this.normals = new Float32Array(quads * 12);
    this.uvs = new Float32Array(quads * 8);
    this.indices = new Uint32Array(quads * 6);
    this.us = new Float64Array(lines);
    this.vs = new Float64Array(lines);
  }

  /**
   * A closed solid wall in its own frame: `x` runs along the wall (0..length), `y` up (0..height)
   * and the body occupies `z ∈ [-thickness, 0]`. The **interior face is the plane z = 0 and looks
   * toward +z**; outward is −z. The room places each wall with a position and a rotation about Y.
   *
   * Holes are cut without CSG: both big faces are split on a grid made from the hole edges and
   * the cells covered by a hole are skipped; the hole sides (jambs, lintel, sill) are added as
   * reveal quads. Only the first `holeCount` holes count; they must not overlap (invariant I4).
   */
  write(
    length: number,
    height: number,
    thickness: number,
    holes: readonly WallHole[],
    holeCount: number = holes.length,
  ): void {
    this.vertexCount = 0;
    this.indexCount = 0;
    const t = thickness;
    this.nu = 0;
    this.nv = 0;
    this.addLine(this.us, 'u', 0);
    this.addLine(this.us, 'u', length);
    this.addLine(this.vs, 'v', 0);
    this.addLine(this.vs, 'v', height);
    for (let i = 0; i < holeCount; i += 1) {
      const h = holes[i] as WallHole;
      this.addLine(this.us, 'u', h.u0);
      this.addLine(this.us, 'u', h.u1);
      this.addLine(this.vs, 'v', h.v0);
      this.addLine(this.vs, 'v', h.v1);
    }
    const { us, vs, nu, nv } = this;

    // Interior (z = 0, toward +z) and exterior (z = -thickness, toward -z) faces; UVs in metres.
    for (let i = 0; i < nu - 1; i += 1) {
      for (let j = 0; j < nv - 1; j += 1) {
        const u0 = us[i] as number;
        const u1 = us[i + 1] as number;
        const v0 = vs[j] as number;
        const v1 = vs[j + 1] as number;
        if (covered(holes, holeCount, (u0 + u1) / 2, (v0 + v1) / 2)) continue;
        this.rect(2, 0, u0, u1, v0, v1, 1, 0, 0, false);
        this.rect(2, -t, u0, u1, v0, v1, -1, 0, 0, false);
      }
    }

    // Top (y = height) and bottom (y = 0) strips, skipping spans where a hole reaches that edge.
    for (let i = 0; i < nu - 1; i += 1) {
      const u0 = us[i] as number;
      const u1 = us[i + 1] as number;
      const mid = (u0 + u1) / 2;
      if (!reaches(holes, holeCount, mid, height, true)) {
        this.rect(1, height, u0, u1, -t, 0, 1, 0, t, false);
      }
      if (!reaches(holes, holeCount, mid, 0, false))
        this.rect(1, 0, u0, u1, -t, 0, -1, 0, t, false);
    }

    // End caps at x = 0 and x = length.
    this.rect(0, 0, -t, 0, 0, height, -1, t, 0, false);
    this.rect(0, length, -t, 0, 0, height, 1, t, 0, false);

    // Reveals: the sides of each hole, facing into the opening.
    for (let i = 0; i < holeCount; i += 1) {
      const h = holes[i] as WallHole;
      this.rect(0, h.u0, -t, 0, h.v0, h.v1, 1, t, -h.v0, false);
      this.rect(0, h.u1, -t, 0, h.v0, h.v1, -1, t, -h.v0, false);
      if (h.v1 < height - EPS) this.rect(1, h.v1, h.u0, h.u1, -t, 0, -1, -h.u0, t, true);
      if (h.v0 > EPS) this.rect(1, h.v0, h.u0, h.u1, -t, 0, 1, -h.u0, t, true);
    }
  }

  /** The mesh written last, as exact-size copies (for caching). */
  toMeshData(): MeshData {
    return {
      positions: this.positions.slice(0, this.vertexCount * 3),
      normals: this.normals.slice(0, this.vertexCount * 3),
      uvs: this.uvs.slice(0, this.vertexCount * 2),
      indices: this.indices.slice(0, this.indexCount),
    };
  }

  /** Inserts a grid line keeping the list sorted and without near-duplicates. */
  private addLine(lines: Float64Array, which: 'u' | 'v', raw: number) {
    const value = Math.round(raw * 1e6) / 1e6;
    let n = which === 'u' ? this.nu : this.nv;
    let i = n;
    while (i > 0 && (lines[i - 1] as number) > value) i -= 1;
    if (i > 0 && lines[i - 1] === value) return;
    for (let k = n; k > i; k -= 1) lines[k] = lines[k - 1] as number;
    lines[i] = value;
    n += 1;
    if (which === 'u') this.nu = n;
    else this.nv = n;
  }

  /**
   * An axis-aligned rectangle on the plane `axis = c`, spanning `[p0, p1] × [q0, q1]` on the other
   * two axes (`SPAN`), facing `sign` along `axis`. UV = (p + pOffset, q + qOffset), or swapped.
   */
  private rect(
    axis: Axis,
    c: number,
    p0: number,
    p1: number,
    q0: number,
    q1: number,
    sign: 1 | -1,
    pOffset: number,
    qOffset: number,
    swapUv: boolean,
  ) {
    const [pAxis, qAxis, natural] = SPAN[axis];
    const order = natural === sign ? ORDER_FRONT : ORDER_BACK;
    const base = this.vertexCount;
    const corner = this.corner;
    for (let k = 0; k < 4; k += 1) {
      const index = order[k] as number;
      const p = CORNER_P[index] ? p1 : p0;
      const q = CORNER_Q[index] ? q1 : q0;
      corner[axis] = c;
      corner[pAxis] = p;
      corner[qAxis] = q;
      const v = this.vertexCount;
      this.positions[v * 3] = corner[0] as number;
      this.positions[v * 3 + 1] = corner[1] as number;
      this.positions[v * 3 + 2] = corner[2] as number;
      this.normals[v * 3] = axis === 0 ? sign : 0;
      this.normals[v * 3 + 1] = axis === 1 ? sign : 0;
      this.normals[v * 3 + 2] = axis === 2 ? sign : 0;
      this.uvs[v * 2] = swapUv ? q + qOffset : p + pOffset;
      this.uvs[v * 2 + 1] = swapUv ? p + pOffset : q + qOffset;
      this.vertexCount = v + 1;
    }
    const i = this.indexCount;
    this.indices[i] = base;
    this.indices[i + 1] = base + 1;
    this.indices[i + 2] = base + 2;
    this.indices[i + 3] = base;
    this.indices[i + 4] = base + 2;
    this.indices[i + 5] = base + 3;
    this.indexCount = i + 6;
  }
}

function covered(holes: readonly WallHole[], count: number, u: number, v: number): boolean {
  for (let i = 0; i < count; i += 1) {
    const h = holes[i] as WallHole;
    if (u > h.u0 && u < h.u1 && v > h.v0 && v < h.v1) return true;
  }
  return false;
}

/** Does a hole reach the top (or bottom) edge at `u`? Then that edge has no face there. */
function reaches(
  holes: readonly WallHole[],
  count: number,
  u: number,
  edge: number,
  top: boolean,
): boolean {
  for (let i = 0; i < count; i += 1) {
    const h = holes[i] as WallHole;
    const touches = top ? h.v1 >= edge - EPS : h.v0 <= EPS;
    if (touches && u > h.u0 && u < h.u1) return true;
  }
  return false;
}

/** A closed solid wall with holes, as cacheable mesh data (see `WallMeshWriter.write`). */
export function buildWallMesh(
  length: number,
  height: number,
  thickness: number,
  holes: readonly WallHole[] = [],
): MeshData {
  const writer = new WallMeshWriter(holes.length);
  writer.write(length, height, thickness, holes);
  return writer.toMeshData();
}
