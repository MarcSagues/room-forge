'use client';

import { type DeepReadonly, type MaterialRef, resolveMaterial } from '@roomforge/core';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MeshStandardMaterial } from 'three';
import type { MaterialLease } from './material-factory';
import { useMaterialFactory } from './materials-context';

/**
 * The material to draw `ref` with, from the shared factory. It is `null` for the first commit (the
 * lease is taken in a layout effect, which re-renders before anything is painted). When `ref`
 * changes the lease is updated: in place if this component is the only user, so a colour being
 * dragged changes one material and compiles nothing; otherwise it moves to another material.
 * `options` must not change during the component's life.
 */
export function useMaterial(
  ref: DeepReadonly<MaterialRef>,
  options: { transparent?: boolean; shared?: boolean } = {},
): MeshStandardMaterial | null {
  const factory = useMaterialFactory();
  const { presetId, tint, roughness, metalness } = ref;
  const look = useMemo(
    () =>
      resolveMaterial({
        presetId,
        ...(tint !== undefined ? { tint } : {}),
        ...(roughness !== undefined ? { roughness } : {}),
        ...(metalness !== undefined ? { metalness } : {}),
      }),
    [presetId, tint, roughness, metalness],
  );
  const latest = useRef(look);
  latest.current = look;
  const lease = useRef<MaterialLease | null>(null);
  const [material, setMaterial] = useState<MeshStandardMaterial | null>(null);
  const { transparent, shared } = options;

  // Takes the lease when the component appears (or the factory is replaced) and lets go when it
  // goes. Strict Mode runs this twice; the cleanup makes that harmless.
  useLayoutEffect(() => {
    const taken = factory.acquire(latest.current, {
      ...(transparent !== undefined ? { transparent } : {}),
      ...(shared !== undefined ? { shared } : {}),
    });
    lease.current = taken;
    setMaterial(taken.material);
    return () => {
      taken.release();
      lease.current = null;
    };
  }, [factory, transparent, shared]);

  // Follows the look after that. Changing it in place needs no re-render; moving to another
  // material does, so the mesh is handed the new one.
  useLayoutEffect(() => {
    if (lease.current?.update(look)) setMaterial(lease.current.material);
  }, [look]);

  return material;
}
