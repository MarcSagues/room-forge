'use client';

import { useShallow } from 'zustand/react/shallow';
import { DragGuides } from '../interaction/drag-guides';
import { KeyboardNudge, Picking, SelectionOutline } from '../interaction/selection';
import { type EntityRegistry, EntityRegistryProvider } from '../objects/entity-registry';
import { ObjectList } from '../objects/object-views';
import { RoomMesh } from '../room/room-mesh';
import { useSessionState } from './use-session-state';

/** Everything drawn inside the canvas: lights, every room and every object of the document. */
export function SceneContent({ registry }: { registry?: EntityRegistry }) {
  const roomIds = useSessionState(useShallow((state) => state.document.roomOrder));
  return (
    <>
      <PlaceholderLights />
      {roomIds.map((id) => (
        <RoomMesh key={id} roomId={id} />
      ))}
      <EntityRegistryProvider {...(registry ? { registry } : {})}>
        <ObjectList />
        <SelectionOutline />
        <DragGuides />
        <Picking />
        <KeyboardNudge />
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
