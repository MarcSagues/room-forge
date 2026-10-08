import { MeshBuilder, type MeshData, type Vec3 } from './mesh-data';

/** Rectangular opening in wall-local metres: `u` along the wall, `v` up from the floor. */
export interface WallHole {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
}

const EPS = 1e-6;

const sortedUnique = (values: number[]) =>
  [...new Set(values.map((v) => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);

/**
 * A closed solid wall in its own frame: `x` runs along the wall (0..length), `y` up (0..height) and
 * the body occupies `z ∈ [-thickness, 0]`. The **interior face is the plane z = 0 and looks toward
 * +z**; outward is −z. The room places each wall with a position and a rotation about Y.
 *
 * Holes are cut without CSG: both big faces are split on a grid made from the hole edges and the
 * cells covered by a hole are skipped; the hole sides (jambs, lintel, sill) are added as reveal
 * quads. Holes must not overlap (invariant I4), and the door/window frames come with P3-12.
 */
export function buildWallMesh(
  length: number,
  height: number,
  thickness: number,
  holes: readonly WallHole[] = [],
): MeshData {
  const mesh = new MeshBuilder();
  const us = sortedUnique([0, length, ...holes.flatMap((h) => [h.u0, h.u1])]);
  const vs = sortedUnique([0, height, ...holes.flatMap((h) => [h.v0, h.v1])]);
  const covered = (u: number, v: number) =>
    holes.some((h) => u > h.u0 && u < h.u1 && v > h.v0 && v < h.v1);

  // Interior (z = 0, toward +z) and exterior (z = -thickness, toward -z) faces. UVs are in metres.
  for (let i = 0; i < us.length - 1; i += 1) {
    for (let j = 0; j < vs.length - 1; j += 1) {
      const [u0, u1, v0, v1] = [us[i], us[i + 1], vs[j], vs[j + 1]] as [
        number,
        number,
        number,
        number,
      ];
      if (covered((u0 + u1) / 2, (v0 + v1) / 2)) continue;
      const uvs = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ] as const;
      mesh.quad(
        [
          [u0, v0, 0],
          [u1, v0, 0],
          [u1, v1, 0],
          [u0, v1, 0],
        ],
        [0, 0, 1],
        uvs,
      );
      mesh.quad(
        [
          [u0, v0, -thickness],
          [u1, v0, -thickness],
          [u1, v1, -thickness],
          [u0, v1, -thickness],
        ],
        [0, 0, -1],
        uvs,
      );
    }
  }

  // Top (y = height) and bottom (y = 0) strips, skipping spans where a hole reaches that edge.
  const spans = (edge: 'top' | 'bottom') =>
    holes
      .filter((h) => (edge === 'top' ? h.v1 >= height - EPS : h.v0 <= EPS))
      .map((h) => [h.u0, h.u1] as const);
  for (const edge of ['top', 'bottom'] as const) {
    const y = edge === 'top' ? height : 0;
    const skip = spans(edge);
    for (let i = 0; i < us.length - 1; i += 1) {
      const [u0, u1] = [us[i], us[i + 1]] as [number, number];
      const mid = (u0 + u1) / 2;
      if (skip.some(([a, b]) => mid > a && mid < b)) continue;
      mesh.quad(
        [
          [u0, y, -thickness],
          [u1, y, -thickness],
          [u1, y, 0],
          [u0, y, 0],
        ],
        [0, edge === 'top' ? 1 : -1, 0],
        [
          [u0, 0],
          [u1, 0],
          [u1, thickness],
          [u0, thickness],
        ],
      );
    }
  }

  // End caps at x = 0 and x = length.
  const cap = (x: number, nx: 1 | -1) =>
    mesh.quad(
      [
        [x, 0, -thickness],
        [x, 0, 0],
        [x, height, 0],
        [x, height, -thickness],
      ],
      [nx, 0, 0],
      [
        [0, 0],
        [thickness, 0],
        [thickness, height],
        [0, height],
      ],
    );
  cap(0, -1);
  cap(length, 1);

  // Reveals: the sides of each hole, facing into the opening.
  for (const h of holes) {
    const side = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3, run: number) =>
      mesh.quad([a, b, c, d], normal, [
        [0, 0],
        [thickness, 0],
        [thickness, run],
        [0, run],
      ]);
    side(
      [h.u0, h.v0, -thickness],
      [h.u0, h.v0, 0],
      [h.u0, h.v1, 0],
      [h.u0, h.v1, -thickness],
      [1, 0, 0],
      h.v1 - h.v0,
    );
    side(
      [h.u1, h.v0, -thickness],
      [h.u1, h.v0, 0],
      [h.u1, h.v1, 0],
      [h.u1, h.v1, -thickness],
      [-1, 0, 0],
      h.v1 - h.v0,
    );
    if (h.v1 < height - EPS) {
      side(
        [h.u0, h.v1, -thickness],
        [h.u0, h.v1, 0],
        [h.u1, h.v1, 0],
        [h.u1, h.v1, -thickness],
        [0, -1, 0],
        h.u1 - h.u0,
      );
    }
    if (h.v0 > EPS) {
      side(
        [h.u0, h.v0, -thickness],
        [h.u0, h.v0, 0],
        [h.u1, h.v0, 0],
        [h.u1, h.v0, -thickness],
        [0, 1, 0],
        h.u1 - h.u0,
      );
    }
  }

  return mesh.build();
}
