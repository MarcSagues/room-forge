'use client';

import { useThree } from '@react-three/fiber';
import type { LightQuality } from '@roomforge/core';
import { type RefObject, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DragGuides } from '../interaction/drag-guides';
import { PlacementGhost } from '../interaction/placement-ghost';
import { RotationHandle } from '../interaction/rotation-handle';
import { ObjectKeys, Picking, SelectionOutline } from '../interaction/selection';
import { GlobalLighting, type GlobalLightingReport } from '../lighting/global-lights-view';
import type { LightPoolDriver } from '../lighting/light-pool-driver';
import { LightPool } from '../lighting/light-pool-view';
import { createShadowRefresh, ShadowRefreshContext } from '../lighting/shadow-refresh';
import { type EntityRegistry, EntityRegistryProvider } from '../objects/entity-registry';
import { ObjectList } from '../objects/object-views';
import { RoomMesh } from '../room/room-mesh';
import { useSessionState } from './use-session-state';

/** Everything drawn inside the canvas: lights, every room and every object of the document. */
export function SceneContent({
  registry,
  quality = 'medium',
  lightPool,
  lighting,
}: {
  registry?: EntityRegistry;
  quality?: LightQuality;
  lightPool?: RefObject<LightPoolDriver | null>;
  lighting?: RefObject<GlobalLightingReport | null>;
}) {
  const roomIds = useSessionState(useShallow((state) => state.document.roomOrder));
  const shadowMap = useThree((state) => state.gl.shadowMap);
  const shadows = useMemo(() => createShadowRefresh(shadowMap), [shadowMap]);
  return (
    <ShadowRefreshContext.Provider value={shadows}>
      <GlobalLighting
        quality={quality}
        shadows={shadows}
        {...(lighting ? { report: lighting } : {})}
      />
      <LightPool quality={quality} {...(lightPool ? { driverRef: lightPool } : {})} />
      <EntityRegistryProvider {...(registry ? { registry } : {})}>
        {/* Rooms register their openings, so they share the registry with the objects. */}
        {roomIds.map((id) => (
          <RoomMesh key={id} roomId={id} />
        ))}
        <ObjectList />
        <SelectionOutline />
        <DragGuides />
        <PlacementGhost />
        <Picking />
        <RotationHandle />
        <ObjectKeys />
      </EntityRegistryProvider>
    </ShadowRefreshContext.Provider>
  );
}
