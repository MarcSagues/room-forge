import { describe, expect, it } from 'vitest';
import { areaFacing, boundingBox, triangles } from './geometry-test-utils';
import { triangleCount } from './mesh-data';
import { buildCeilingMesh, buildFloorMesh } from './surface-meshes';

describe('buildFloorMesh', () => {
  const mesh = buildFloorMesh(4, 4.5);

  it('covers exactly the interior at y = 0, facing up', () => {
    expect(boundingBox(mesh)).toEqual({ min: [0, 0, 0], max: [4, 0, 4.5] });
    expect(triangleCount(mesh)).toBe(2);
    expect(areaFacing(mesh, [0, 1, 0])).toBeCloseTo(18, 5);
    for (const t of triangles(mesh)) expect(t.geometric[1]).toBeCloseTo(1, 5);
  });

  it('maps UVs to world metres', () => {
    expect(Math.max(...[...mesh.uvs].filter((_, i) => i % 2 === 0))).toBe(4);
    expect(Math.max(...[...mesh.uvs].filter((_, i) => i % 2 === 1))).toBe(4.5);
  });
});

describe('buildCeilingMesh', () => {
  const mesh = buildCeilingMesh(4, 4.5, 2.6);

  it('sits at the room height and faces down into the room', () => {
    expect(boundingBox(mesh)).toEqual({ min: [0, 2.6, 0], max: [4, 2.6, 4.5] });
    expect(areaFacing(mesh, [0, -1, 0])).toBeCloseTo(18, 5);
    for (const t of triangles(mesh)) expect(t.geometric[1]).toBeCloseTo(-1, 5);
  });
});
