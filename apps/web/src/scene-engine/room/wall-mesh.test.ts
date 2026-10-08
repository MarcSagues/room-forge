import { describe, expect, it } from 'vitest';
import { areaFacing, boundingBox, near, triangles } from './geometry-test-utils';
import { triangleCount } from './mesh-data';
import { buildWallMesh, type WallHole } from './wall-mesh';

const L = 4;
const H = 2.6;
const T = 0.1;
const DOOR: WallHole = { u0: 1, u1: 1.9, v0: 0, v1: 2.1 };
const WINDOW: WallHole = { u0: 2.4, u1: 3.4, v0: 0.9, v1: 2.1 };

describe('buildWallMesh without holes', () => {
  const mesh = buildWallMesh(L, H, T);

  it('is a closed box: 6 faces, 12 triangles', () => {
    expect(triangleCount(mesh)).toBe(12);
    const area = triangles(mesh).reduce((sum, t) => sum + t.area, 0);
    expect(area).toBeCloseTo(2 * (L * H + L * T + H * T), 5);
  });

  it('has the exact bounding box: length × height × thickness, outward is -z', () => {
    expect(boundingBox(mesh)).toEqual({ min: [0, 0, -T], max: [L, H, 0] });
  });

  it('winds every triangle counter-clockwise as seen from its declared normal', () => {
    for (const t of triangles(mesh)) {
      for (let k = 0; k < 3; k += 1) {
        expect(t.geometric[k] as number).toBeCloseTo(t.declared[k] as number, 5);
      }
    }
  });

  it('puts the interior face on z = 0 looking +z and the exterior on z = -thickness looking -z', () => {
    expect(areaFacing(mesh, [0, 0, 1], { axis: 2, value: 0 })).toBeCloseTo(L * H, 5);
    expect(areaFacing(mesh, [0, 0, -1], { axis: 2, value: -T })).toBeCloseTo(L * H, 5);
  });

  it('uses world-metre UVs on the big faces (one unit per metre)', () => {
    const interior = triangles(mesh).find((t) => t.declared[2] === 1);
    expect(interior).toBeDefined();
    const us = [...mesh.uvs].filter((_, i) => i % 2 === 0);
    const vs = [...mesh.uvs].filter((_, i) => i % 2 === 1);
    expect(Math.max(...us)).toBeCloseTo(L, 5);
    expect(Math.max(...vs)).toBeCloseTo(H, 5);
  });
});

describe('buildWallMesh with holes', () => {
  it('removes the hole area from both big faces and keeps the bounding box', () => {
    const mesh = buildWallMesh(L, H, T, [DOOR, WINDOW]);
    const holes =
      (DOOR.u1 - DOOR.u0) * (DOOR.v1 - DOOR.v0) + (WINDOW.u1 - WINDOW.u0) * (WINDOW.v1 - WINDOW.v0);
    expect(areaFacing(mesh, [0, 0, 1], { axis: 2, value: 0 })).toBeCloseTo(L * H - holes, 5);
    expect(areaFacing(mesh, [0, 0, -1], { axis: 2, value: -T })).toBeCloseTo(L * H - holes, 5);
    expect(boundingBox(mesh)).toEqual({ min: [0, 0, -T], max: [L, H, 0] });
  });

  it('has the expected triangle count for a door (5 cells per face + strips + caps + reveals)', () => {
    // faces: 2 × 5 quads; bottom skips the door span (2 quads); top 3 quads; caps 2; reveals:
    // two jambs + lintel (a door reaches the floor, so no sill) → 10 + 2 + 3 + 2 + 3 = 20 quads.
    expect(triangleCount(buildWallMesh(L, H, T, [DOOR]))).toBe(40);
  });

  it('adds a sill reveal for windows and no sill for doors', () => {
    const sills = (hole: WallHole) =>
      triangles(buildWallMesh(L, H, T, [hole])).filter(
        (t) =>
          t.declared[1] === 1 && [t.a, t.b, t.c].every((p) => near(p[1], hole.v0)) && hole.v0 > 0,
      ).length;
    expect(sills(WINDOW)).toBe(2);
    expect(sills(DOOR)).toBe(0);
  });

  it('lines the reveals up with the hole edges and faces them into the opening', () => {
    const mesh = buildWallMesh(L, H, T, [WINDOW]);
    const jambs = triangles(mesh).filter(
      (t) =>
        t.declared[0] !== 0 &&
        [t.a, t.b, t.c].every((p) => near(p[0], WINDOW.u0) || near(p[0], WINDOW.u1)),
    );
    expect(jambs.length).toBe(4);
    for (const t of jambs) {
      const x = t.a[0];
      expect(t.declared[0]).toBe(near(x, WINDOW.u0) ? 1 : -1);
    }
  });

  it('keeps winding consistent with the declared normals, holes included', () => {
    for (const t of triangles(buildWallMesh(L, H, T, [DOOR, WINDOW]))) {
      for (let k = 0; k < 3; k += 1) {
        expect(t.geometric[k] as number).toBeCloseTo(t.declared[k] as number, 5);
      }
    }
  });

  it('copes with a hole that reaches the top edge (no top face over the gap)', () => {
    const tall: WallHole = { u0: 1, u1: 2, v0: 0, v1: H };
    const mesh = buildWallMesh(L, H, T, [tall]);
    const topArea = areaFacing(mesh, [0, 1, 0]);
    expect(topArea).toBeCloseTo((L - 1) * T, 5);
  });
});

describe('buildWallMesh at the room limits', () => {
  it.each([
    [2.2, 2.2],
    [12.2, 4],
  ])('is well formed for length %s and height %s', (length, height) => {
    const mesh = buildWallMesh(length, height, T);
    expect(boundingBox(mesh)).toEqual({ min: [0, 0, -T], max: [length, height, 0] });
    expect(triangleCount(mesh)).toBe(12);
  });
});
