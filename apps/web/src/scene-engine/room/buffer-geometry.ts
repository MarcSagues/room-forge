'use client';

import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { MeshData } from './mesh-data';

/** Wraps pure mesh data in a three.js geometry (the typed arrays are shared, not copied). */
export function toBufferGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Line segments from flat `[x0,y0,z0, x1,y1,z1, ...]` positions. */
export function toLineGeometry(positions: Float32Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Builds a geometry once per input and frees its GPU buffers when the input changes or the
 * component unmounts (R3F only disposes geometries it created itself).
 */
export function useDisposable<T, G extends BufferGeometry>(input: T, create: (input: T) => G): G {
  const geometry = useMemo(() => create(input), [input, create]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export const useMeshGeometry = (mesh: MeshData) => useDisposable(mesh, toBufferGeometry);
export const useLineGeometry = (positions: Float32Array) =>
  useDisposable(positions, toLineGeometry);
