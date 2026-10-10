import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { openingResources } from './opening-resources';
import { WallOpeningsLayer } from './wall-openings';

const T = 0.1;
const DOOR = { kind: 'door', variant: 'door.double', width: 1.6, height: 2.1 } as const;
const WINDOW = { kind: 'window', variant: 'window.standard', width: 1, height: 1.2 } as const;

/** World box of every instance of a slot, in the wall frame. */
function bounds(layer: WallOpeningsLayer, slot: 'frame' | 'leaf' | 'glass') {
  const mesh = layer.meshes[slot];
  const box = new Box3();
  const matrix = new Matrix4();
  const unit = new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix);
    box.union(unit.clone().applyMatrix4(matrix));
  }
  return box;
}

describe('WallOpeningsLayer', () => {
  it('shares one geometry and one material per slot between every wall', () => {
    const a = new WallOpeningsLayer();
    const b = new WallOpeningsLayer();
    const { geometry, materials } = openingResources();
    expect(a.meshes.frame.geometry).toBe(geometry);
    expect(b.meshes.glass.geometry).toBe(geometry);
    expect(a.meshes.leaf.material).toBe(materials.leaf);
    expect(b.meshes.leaf.material).toBe(materials.leaf);
  });

  it('starts empty and lays out a door and a window on the wall', () => {
    const layer = new WallOpeningsLayer();
    expect(layer.meshes.frame.count).toBe(0);
    expect(layer.meshes.frame.visible).toBe(false);
    layer.begin();
    layer.add(DOOR, 1.5, 0, T);
    layer.add(WINDOW, 3.5, 0.9, T);
    layer.commit();
    expect(layer.meshes.frame.visible).toBe(true);
    expect(layer.meshes.leaf.count).toBe(2);
    expect(layer.meshes.glass.count).toBe(1);
    expect(layer.meshes.frame.count).toBe(3 + 4);

    const leaves = bounds(layer, 'leaf');
    expect(leaves.min.x).toBeGreaterThan(1.5 - 0.8);
    expect(leaves.max.x).toBeLessThan(1.5 + 0.8);
    const glass = bounds(layer, 'glass');
    expect(glass.min.y).toBeGreaterThan(0.9);
    expect(glass.max.y).toBeLessThan(2.1);
    // Everything sits in the wall body, z ∈ [-T, 0], standing a little out of each face.
    const frame = bounds(layer, 'frame');
    expect(frame.min.z).toBeCloseTo(-T - 0.01, 5);
    expect(frame.max.z).toBeCloseTo(0.01, 5);
  });

  it('lays out again from scratch', () => {
    const layer = new WallOpeningsLayer();
    layer.begin();
    layer.add(DOOR, 1.5, 0, T);
    layer.commit();
    layer.begin();
    layer.commit();
    expect(layer.meshes.frame.count).toBe(0);
    expect(layer.meshes.leaf.count).toBe(0);
    // Hidden while empty: nothing to draw, so no shader to compile either.
    expect(layer.meshes.leaf.visible).toBe(false);
  });
});
