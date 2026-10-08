'use client';

import { useShallow } from 'zustand/react/shallow';
import { RoomMesh } from '../room/room-mesh';
import { useSessionState } from './use-session-state';

/** Everything drawn inside the canvas: lights and every room of the document. */
export function SceneContent() {
  const roomIds = useSessionState(useShallow((state) => state.document.roomOrder));
  return (
    <>
      <PlaceholderLights />
      {roomIds.map((id) => (
        <RoomMesh key={id} roomId={id} />
      ))}
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
