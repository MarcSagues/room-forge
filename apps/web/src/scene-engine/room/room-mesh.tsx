'use client';

import { type DeepReadonly, type Opening, type Room, type RoomId, WALL_IDS } from '@roomforge/core';
import { memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSessionState } from '../canvas/use-session-state';
import { useMeshGeometry } from './buffer-geometry';
import type { MeshData, Vec3 } from './mesh-data';
import { placeholderColor } from './placeholder-colors';
import { buildRoomGeometry } from './room-geometry';
import { RoomGrid } from './room-grid';

/**
 * One room: floor, ceiling and four walls from the pure geometry builder, positioned at the room's
 * world origin. Subscribes only to its own room and its own openings.
 */
export function RoomMesh({ roomId }: { roomId: RoomId }) {
  const room = useSessionState((state) => state.document.rooms[roomId]);
  const openings = useSessionState(
    useShallow((state) =>
      Object.values(state.document.openings).filter((opening) => opening.roomId === roomId),
    ),
  );
  if (!room) return null;
  return <RoomModel room={room} openings={openings} />;
}

function RoomModel({
  room,
  openings,
}: {
  room: DeepReadonly<Room>;
  openings: readonly DeepReadonly<Opening>[];
}) {
  // Cheap when nothing geometric changed: the builder returns the same cached meshes.
  const geometry = useMemo(() => buildRoomGeometry(room, openings), [room, openings]);
  const { width, depth } = geometry;
  return (
    <group position={[room.origin[0], 0, room.origin[1]]}>
      <Surface mesh={geometry.floor} color={placeholderColor(room.floor.material)} />
      <Surface mesh={geometry.ceiling} color={placeholderColor(room.ceiling.material)} />
      {WALL_IDS.map((wall) => (
        <Surface
          key={wall}
          mesh={geometry.walls[wall].mesh}
          position={geometry.walls[wall].position}
          rotationY={geometry.walls[wall].rotationY}
          color={placeholderColor(room.walls[wall].material)}
        />
      ))}
      <RoomGrid width={width} depth={depth} />
    </group>
  );
}

const ORIGIN: Vec3 = [0, 0, 0];

const Surface = memo(function Surface(props: {
  mesh: MeshData;
  color: string;
  position?: Vec3;
  rotationY?: number;
}) {
  const { mesh, color, position = ORIGIN, rotationY = 0 } = props;
  const geometry = useMeshGeometry(mesh);
  return (
    <mesh geometry={geometry} position={position} rotation-y={rotationY}>
      <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
    </mesh>
  );
});
