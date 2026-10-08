import type { MeshData, Vec3 } from './mesh-data';

/** Helpers shared by the geometry tests (not part of the production bundle). */

export interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

/** Rounds to 1e-5 and turns -0 into 0 so results compare cleanly with `toEqual`. */
export const round5 = (v: number) => Math.round(v * 1e5) / 1e5 + 0;

export function boundingBox(mesh: MeshData, transform?: (p: Vec3) => Vec3): Box {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const raw: Vec3 = [
      mesh.positions[i] as number,
      mesh.positions[i + 1] as number,
      mesh.positions[i + 2] as number,
    ];
    const p = transform ? transform(raw) : raw;
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k] as number, p[k] as number);
      max[k] = Math.max(max[k] as number, p[k] as number);
    }
  }
  // Positions are stored as Float32, so compare to 1e-5 (the bounding box is exact up to that).
  return { min: min.map(round5) as Box['min'], max: max.map(round5) as Box['max'] };
}

const vertex = (mesh: MeshData, index: number): Vec3 => [
  mesh.positions[index * 3] as number,
  mesh.positions[index * 3 + 1] as number,
  mesh.positions[index * 3 + 2] as number,
];

export interface Triangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  /** Normal declared in the vertex data. */
  declared: Vec3;
  /** Normal from the winding (counter-clockwise = front face). */
  geometric: Vec3;
  area: number;
}

export function triangles(mesh: MeshData): Triangle[] {
  const result: Triangle[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [ia, ib, ic] = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]] as [
      number,
      number,
      number,
    ];
    const [a, b, c] = [vertex(mesh, ia), vertex(mesh, ib), vertex(mesh, ic)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
      (u[1] as number) * (v[2] as number) - (u[2] as number) * (v[1] as number),
      (u[2] as number) * (v[0] as number) - (u[0] as number) * (v[2] as number),
      (u[0] as number) * (v[1] as number) - (u[1] as number) * (v[0] as number),
    ] as [number, number, number];
    const len = Math.hypot(...n);
    result.push({
      a,
      b,
      c,
      declared: [
        mesh.normals[ia * 3] as number,
        mesh.normals[ia * 3 + 1] as number,
        mesh.normals[ia * 3 + 2] as number,
      ],
      geometric: [n[0] / len, n[1] / len, n[2] / len],
      area: len / 2,
    });
  }
  return result;
}

/** Sum of the areas of the triangles facing `normal` that lie on the plane `axis = value`. */
export function areaFacing(
  mesh: MeshData,
  normal: Vec3,
  plane?: { axis: 0 | 1 | 2; value: number },
): number {
  return triangles(mesh)
    .filter((t) => t.declared.every((d, k) => Math.abs(d - (normal[k] as number)) < 1e-6))
    .filter(
      (t) =>
        !plane ||
        [t.a, t.b, t.c].every((p) => Math.abs((p[plane.axis] as number) - plane.value) < 1e-6),
    )
    .reduce((sum, t) => sum + t.area, 0);
}

/** Wall frame → room-local, the same rotation three.js applies for `rotation.y = θ`. */
export function toRoomSpace(position: Vec3, rotationY: number) {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const rotate = (p: Vec3): Vec3 => [p[0] * cos + p[2] * sin, p[1], -p[0] * sin + p[2] * cos];
  const point = (p: Vec3): Vec3 => {
    const r = rotate(p);
    return [r[0] + position[0], r[1] + position[1], r[2] + position[2]];
  };
  return { point, direction: rotate };
}

export const near = (actual: number, expected: number, digits = 5) =>
  Math.abs(actual - expected) < 10 ** -digits;
