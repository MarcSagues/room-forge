export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];

/**
 * Indexed triangle mesh as plain typed arrays, so geometry generation is pure and testable without
 * three.js or WebGL. The scene engine turns it into a `BufferGeometry`. Treat it as immutable:
 * cached meshes are shared between walls.
 */
export interface MeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Accumulates quads. Winding is derived from the declared normal, so callers cannot get it wrong. */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  /**
   * Adds a quad whose corners are given in any consistent order around its perimeter.
   * `normal` is the direction the visible face must look at; the triangles are wound to match.
   */
  quad(
    corners: readonly [Vec3, Vec3, Vec3, Vec3],
    normal: Vec3,
    uvs: readonly [Vec2, Vec2, Vec2, Vec2],
  ) {
    const [a, b, c] = corners;
    const faces = dot(cross(sub(b, a), sub(c, a)), normal) > 0;
    const order = faces ? [0, 1, 2, 3] : [0, 3, 2, 1];
    const base = this.positions.length / 3;
    for (const i of order) {
      this.positions.push(...(corners[i] as Vec3));
      this.normals.push(...normal);
      this.uvs.push(...(uvs[i] as Vec2));
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): MeshData {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
    };
  }
}

export function triangleCount(mesh: MeshData): number {
  return mesh.indices.length / 3;
}
