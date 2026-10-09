'use client';

import { useFrame, useThree } from '@react-three/fiber';
import {
  type DeepReadonly,
  type MaterialRef,
  type Opening,
  type Room,
  type RoomId,
  WALL_IDS,
  type WallId,
} from '@roomforge/core';
import { memo, type RefObject, useEffect, useMemo, useRef } from 'react';
import { type Group, type MeshStandardMaterial, Vector3 } from 'three';
import { useShallow } from 'zustand/react/shallow';
import { prefersReducedMotion } from '../camera/reduced-motion';
import { useSceneSession } from '../canvas/scene-context';
import { useSessionState } from '../canvas/use-session-state';
import { useMaterial } from '../materials/use-material';
import { useMeshGeometry } from './buffer-geometry';
import type { MeshData, Vec3 } from './mesh-data';
import { buildRoomGeometry } from './room-geometry';
import { RoomGrid } from './room-grid';
import { approach, WALL_TRANSITION_MS, wallHeightScale, wallTargetOpacity } from './wall-display';

/** Object names the E2E hook reads (`SceneHandle.roomDisplay`). */
export const roomObjectName = {
  walls: (roomId: RoomId) => `room:${roomId}:walls`,
  wall: (roomId: RoomId, wall: WallId) => `room:${roomId}:wall:${wall}`,
  ceiling: (roomId: RoomId) => `room:${roomId}:ceiling`,
};

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

type WallMaterials = Partial<Record<WallId, MeshStandardMaterial | null>>;

function RoomModel({
  room,
  openings,
}: {
  room: DeepReadonly<Room>;
  openings: readonly DeepReadonly<Opening>[];
}) {
  // Cheap when nothing geometric changed: the builder returns the same cached meshes.
  const geometry = useMemo(() => buildRoomGeometry(room, openings), [room, openings]);
  // The ceiling is a preview aid: hidden while editing and always in the plan view.
  const ceilingVisible = useSessionState(
    (state) => state.showCeiling && state.view === 'perspective',
  );
  const walls = useRef<Group>(null);
  const materials = useRef<WallMaterials>({});
  // Stable ref callbacks, so the memoised walls do not re-render with the room.
  const materialRefs = useMemo(
    () =>
      Object.fromEntries(
        WALL_IDS.map((wall) => [
          wall,
          (material: MeshStandardMaterial | null) => {
            materials.current[wall] = material;
          },
        ]),
      ) as Record<WallId, (material: MeshStandardMaterial | null) => void>,
    [],
  );
  const { width, depth } = geometry;
  return (
    <group position={[room.origin[0], 0, room.origin[1]]}>
      <Surface mesh={geometry.floor} material={room.floor.material} />
      <Surface
        name={roomObjectName.ceiling(room.id)}
        mesh={geometry.ceiling}
        material={room.ceiling.material}
        visible={ceilingVisible}
      />
      <group ref={walls} name={roomObjectName.walls(room.id)}>
        {WALL_IDS.map((wall) => (
          <Surface
            key={wall}
            name={roomObjectName.wall(room.id, wall)}
            mesh={geometry.walls[wall].mesh}
            position={geometry.walls[wall].position}
            rotationY={geometry.walls[wall].rotationY}
            material={room.walls[wall].material}
            // Always transparent, so fading never changes the shader program (no recompiles), and
            // each wall has a material of its own: they fade one by one.
            wall
            materialRef={materialRefs[wall]}
          />
        ))}
      </group>
      <WallFader walls={walls} materials={materials} roomHeight={room.height} />
      <RoomGrid width={width} depth={depth} />
    </group>
  );
}

const view = new Vector3();
/** Longest step a transition takes in one frame: after an idle period it still animates. */
const MAX_STEP_MS = 50;

/**
 * Applies the wall mode imperatively on every rendered frame (no React state): cutaway fading from
 * the camera direction and the low walls of down mode, easing towards the target and requesting
 * frames only while something still moves.
 */
function WallFader(props: {
  walls: RefObject<Group | null>;
  materials: RefObject<WallMaterials>;
  roomHeight: number;
}) {
  const { walls, materials, roomHeight } = props;
  const session = useSceneSession();
  const invalidate = useThree((state) => state.invalidate);
  const duration = useMemo(() => (prefersReducedMotion() ? 0 : WALL_TRANSITION_MS), []);
  // The first frame lands directly on the target: walls should not animate on load.
  const settled = useRef(false);

  // A mode change must draw even when the camera is still.
  useEffect(
    () =>
      session.store.subscribe((state, previous) => {
        if (state.wallMode !== previous.wallMode) invalidate();
      }),
    [session, invalidate],
  );

  useFrame((state, delta) => {
    const mode = session.store.getState().wallMode;
    const step = Math.min(delta * 1000, MAX_STEP_MS);
    const ease = settled.current ? duration : 0;
    settled.current = true;
    state.camera.getWorldDirection(view);
    let moving = false;
    for (const wall of WALL_IDS) {
      const material = materials.current[wall];
      if (!material) continue;
      const target = wallTargetOpacity(mode, wall, view.x, view.z);
      material.opacity = approach(material.opacity, target, step, ease);
      if (material.opacity !== target) moving = true;
    }
    const group = walls.current;
    if (group) {
      const target = wallHeightScale(mode, roomHeight);
      group.scale.y = approach(group.scale.y, target, step, ease);
      if (group.scale.y !== target) moving = true;
    }
    if (moving) state.invalidate();
  });
  return null;
}

const ORIGIN: Vec3 = [0, 0, 0];

/** One face of the room: its geometry, and the material the shared factory gives for its look. */
const Surface = memo(function Surface(props: {
  mesh: MeshData;
  material: DeepReadonly<MaterialRef>;
  name?: string;
  position?: Vec3;
  rotationY?: number;
  visible?: boolean;
  /** A wall: see-through and with a material of its own, so that it can fade by itself. */
  wall?: boolean;
  materialRef?: (material: MeshStandardMaterial | null) => void;
}) {
  const {
    mesh,
    position = ORIGIN,
    rotationY = 0,
    visible = true,
    wall = false,
    materialRef,
  } = props;
  const geometry = useMeshGeometry(mesh);
  const material = useMaterial(props.material, { transparent: wall, shared: !wall });
  // The fader changes the opacity of each wall's material every frame: it is told which it is.
  useEffect(() => {
    materialRef?.(material);
    return () => materialRef?.(null);
  }, [material, materialRef]);
  return (
    <mesh
      name={props.name ?? ''}
      geometry={geometry}
      position={position}
      rotation-y={rotationY}
      visible={visible}
    >
      {material ? <primitive object={material} attach="material" dispose={null} /> : null}
    </mesh>
  );
});
