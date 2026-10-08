import { renderHook } from '@testing-library/react';
import { BufferGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { toBufferGeometry, toLineGeometry, useDisposable } from './buffer-geometry';
import { buildFloorMesh } from './surface-meshes';
import { buildWallMesh } from './wall-mesh';

describe('toBufferGeometry', () => {
  it('exposes position, normal, uv and index with the mesh counts', () => {
    const mesh = buildWallMesh(4, 2.6, 0.1);
    const geometry = toBufferGeometry(mesh);
    expect(geometry.getAttribute('position').count).toBe(mesh.positions.length / 3);
    expect(geometry.getAttribute('normal').count).toBe(mesh.normals.length / 3);
    expect(geometry.getAttribute('uv').count).toBe(mesh.uvs.length / 2);
    expect(geometry.getIndex()?.count).toBe(mesh.indices.length);
  });

  it('shares the typed arrays instead of copying them', () => {
    const mesh = buildFloorMesh(3, 3);
    const geometry = toBufferGeometry(mesh);
    expect(geometry.getAttribute('position').array).toBe(mesh.positions);
  });

  it('computes bounds so frustum culling works', () => {
    const geometry = toBufferGeometry(buildFloorMesh(4, 6));
    expect(geometry.boundingBox?.max.x).toBeCloseTo(4, 5);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(6, 5);
    expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
  });
});

describe('toLineGeometry', () => {
  it('holds the segment endpoints as positions', () => {
    const geometry = toLineGeometry(new Float32Array([0, 0, 0, 1, 0, 0]));
    expect(geometry.getAttribute('position').count).toBe(2);
    expect(geometry.getIndex()).toBeNull();
  });
});

describe('useDisposable (GPU buffers must be freed)', () => {
  const create = (n: number) => {
    const geometry = new BufferGeometry();
    vi.spyOn(geometry, 'dispose');
    geometry.userData.n = n;
    return geometry;
  };

  it('creates the geometry once per input and returns the same object while the input is stable', () => {
    const factory = vi.fn(create);
    const { result, rerender } = renderHook(({ input }) => useDisposable(input, factory), {
      initialProps: { input: 1 },
    });
    const first = result.current;
    rerender({ input: 1 });
    expect(result.current).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('disposes the old geometry when the input changes', () => {
    const { result, rerender } = renderHook(({ input }) => useDisposable(input, create), {
      initialProps: { input: 1 },
    });
    const first = result.current;
    rerender({ input: 2 });
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(result.current).not.toBe(first);
    expect(result.current.dispose).not.toHaveBeenCalled();
  });

  it('disposes the geometry on unmount', () => {
    const { result, unmount } = renderHook(() => useDisposable(1, create));
    const geometry = result.current;
    unmount();
    expect(geometry.dispose).toHaveBeenCalledOnce();
  });
});
