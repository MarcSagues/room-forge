'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { LIGHT_POOL_SIZES, type LightQuality } from '@roomforge/core';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { useSceneCatalog, useSceneSession } from '../canvas/scene-context';
import { createLightPool } from './light-pool';
import { createLightPoolDriver, type LightPoolDriver } from './light-pool-driver';

/**
 * The scene's fixed light pool (P5-05). The lights are made once per quality level, so changing it
 * compiles shaders once and nothing else ever does; the driver deals them out to the luminaires
 * outside React. `driverRef` lets the scene handle report what the pool shows.
 */
export function LightPool({
  quality,
  driverRef,
}: {
  quality: LightQuality;
  driverRef?: RefObject<LightPoolDriver | null>;
}) {
  const session = useSceneSession();
  const catalog = useSceneCatalog();
  const invalidate = useThree((state) => state.invalidate);
  const size = LIGHT_POOL_SIZES[quality];
  const pool = useMemo(() => createLightPool(size), [size]);
  const driver = useRef<LightPoolDriver | null>(null);
  useEffect(() => () => pool.dispose(), [pool]);
  useEffect(() => {
    const made = createLightPoolDriver({
      session,
      catalog,
      pool,
      size,
      invalidate: () => invalidate(),
    });
    driver.current = made;
    if (driverRef) driverRef.current = made;
    invalidate(); // the next frame hands the driver its camera
    return () => {
      made.dispose();
      if (driver.current === made) driver.current = null;
      if (driverRef?.current === made) driverRef.current = null;
    };
  }, [session, catalog, pool, size, invalidate, driverRef]);
  useFrame(({ camera }) => driver.current?.watch(camera));
  return <primitive object={pool.group} dispose={null} />;
}
