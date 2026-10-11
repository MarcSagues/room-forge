'use client';

import type { LightQuality } from '@roomforge/core';
import type { RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DragGuides } from '../interaction/drag-guides';
import { PlacementGhost } from '../interaction/placement-ghost';
import { RotationHandle } from '../interaction/rotation-handle';
import { ObjectKeys, Picking, SelectionOutline } from '../interaction/selection';
import type { LightPoolDriver } from '../lighting/light-pool-driver';
import { LightPool } from '../lighting/light-pool-view';
import { type EntityRegistry, EntityRegistryProvider } from '../objects/entity-registry';
import { ObjectList } from '../objects/object-views';
import { RoomMesh } from '../room/room-mesh';
import { useSessionState } from './use-session-state';

/** Everything drawn inside the canvas: lights, every room and every object of the document. */
export function SceneContent({
  registry,
  quality = 'medium',
  lightPool,
  viewOnly,
}: {
  registry?: EntityRegistry;
  quality?: LightQuality;
  lightPool?: RefObject<LightPoolDriver | null>;
  /** Read on every press: true turns picking off without remounting anything. */
  viewOnly?: RefObject<boolean>;
}) {
  const roomIds = useSessionState(useShallow((state) => state.document.roomOrder));
  return (
    <>
      <PlaceholderLights />
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
        <Picking {...(viewOnly ? { viewOnly } : {})} />
        <RotationHandle />
        <ObjectKeys />
      </EntityRegistryProvider>
    </>
  );
}

/** Neutral daylight stand-in until the day/night lighting (P5-06). */
function PlaceholderLights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#8d939c', 1.4]} />
      <directionalLight position={[3, 8, 4]} intensity={1.6} />
    </>
  );
}
