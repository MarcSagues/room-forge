'use client';

import { useFrame, useThree } from '@react-three/fiber';
import {
  type DeepReadonly,
  type MaterialRef,
  type Opening,
  type OpeningId,
  type Room,
  type RoomId,
  WALL_IDS,
  type WallId,
} from '@roomforge/core';
import {
  memo,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { type Group, type Mesh, type MeshStandardMaterial, Vector3 } from 'three';
import { useShallow } from 'zustand/react/shallow';
import { prefersReducedMotion } from '../camera/reduced-motion';
import { useSceneSession, useTransientStore } from '../canvas/scene-context';
import { useSessionState } from '../canvas/use-session-state';
import { useMaterial } from '../materials/use-material';
import { useRegisterEntity } from '../objects/entity-registry';
import { useMeshGeometry } from './buffer-geometry';
import { LiveWall } from './live-wall';
import type { MeshData, Vec3 } from './mesh-data';
import { buildRoomGeometry, WALL_THICKNESS, type WallPlacement } from './room-geometry';
import { RoomGrid } from './room-grid';
import { approach, WALL_TRANSITION_MS, wallHeightScale, wallTargetOpacity } from './wall-display';
import { WallOpeningsLayer } from './wall-openings';

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
type WallGroups = Partial<Record<WallId, Group | null>>;

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
  const openingGroups = useRef<WallGroups>({});
  // Stable ref callbacks, so the memoised walls do not re-render with the room.
  const refs = useMemo(
    () =>
      Object.fromEntries(
        WALL_IDS.map((wall) => [
          wall,
          {
            material: (material: MeshStandardMaterial | null) => {
              materials.current[wall] = material;
            },
            openings: (group: Group | null) => {
              openingGroups.current[wall] = group;
            },
          },
        ]),
      ) as Record<WallId, WallRefs>,
    [],
  );
  const byWall = useMemo(() => {
    const result = { north: [], east: [], south: [], west: [] } as Record<
      WallId,
      DeepReadonly<Opening>[]
    >;
    for (const opening of openings) result[opening.wall].push(opening);
    return result;
  }, [openings]);
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
          <WallView
            key={wall}
            roomId={room.id}
            wall={wall}
            length={wall === 'north' || wall === 'south' ? width + 2 * WALL_THICKNESS : depth}
            height={room.height}
            name={roomObjectName.wall(room.id, wall)}
            placement={geometry.walls[wall]}
            material={room.walls[wall].material}
            openings={byWall[wall]}
            shift={wall === 'north' || wall === 'south' ? WALL_THICKNESS : 0}
            refs={refs[wall]}
          />
        ))}
      </group>
      <WallFader
        walls={walls}
        materials={materials}
        openings={openingGroups}
        roomHeight={room.height}
      />
      <RoomGrid width={width} depth={depth} />
    </group>
  );
}

interface WallRefs {
  material: (material: MeshStandardMaterial | null) => void;
  openings: (group: Group | null) => void;
}

/**
 * One wall in its frame: the solid with its holes, and the doors and windows that fill them
 * (instanced, see `WallOpeningsLayer`). Each opening also gets an empty anchor in the entity
 * registry, at the bottom centre of its hole, so picking, outlines and controllers find it like
 * an object.
 */
const WallView = memo(function WallView(props: {
  roomId: RoomId;
  wall: WallId;
  /** Length of the wall frame and height of the room. */
  length: number;
  height: number;
  name: string;
  placement: WallPlacement;
  material: DeepReadonly<MaterialRef>;
  openings: readonly DeepReadonly<Opening>[];
  /** Where the interior starts along this wall's frame (N/S frames cover the corners). */
  shift: number;
  refs: WallRefs;
}) {
  const { roomId, wall, length, height, placement, openings, shift, refs } = props;
  const session = useSceneSession();
  const transient = useTransientStore();
  const layer = useMemo(() => new WallOpeningsLayer(), []);
  const live = useMemo(
    () =>
      new LiveWall({ session, transient, layer, roomId, wall, shift, thickness: WALL_THICKNESS }),
    [session, transient, layer, roomId, wall, shift],
  );
  useEffect(() => () => layer.dispose(), [layer]);
  useEffect(() => () => live.dispose(), [live]);
  useEffect(() => {
    refs.openings(layer.group);
    return () => refs.openings(null);
  }, [layer, refs]);
  // A dragged opening redraws the wall from the transient store, without React.
  useEffect(() => transient.subscribe(() => live.sync()), [transient, live]);
  useLayoutEffect(() => {
    live.length = length;
    live.height = height;
    if (live.drawing) {
      live.sync();
      return;
    }
    layer.begin();
    for (const o of openings) layer.add(o, shift + o.offset + o.width / 2, o.sill, WALL_THICKNESS);
    layer.commit();
  }, [layer, live, openings, shift, length, height]);
  const onMaterial = useCallback(
    (material: MeshStandardMaterial | null) => {
      refs.material(material);
      live.setMaterial(material);
    },
    [refs, live],
  );
  const onSurface = useCallback(
    (mesh: Mesh | null) => {
      live.surface = mesh;
    },
    [live],
  );
  return (
    <group position={placement.position} rotation-y={placement.rotationY}>
      <Surface
        name={props.name}
        mesh={placement.mesh}
        material={props.material}
        // Always transparent, so fading never changes the shader program (no recompiles), and
        // each wall has a material of its own: they fade one by one.
        wall
        materialRef={onMaterial}
        meshRef={onSurface}
      />
      <primitive object={live.mesh} />
      <primitive object={live.outline} />
      <primitive object={layer.group}>
        {openings.map((o) => (
          <OpeningAnchor
            key={o.id}
            id={o.id}
            x={shift + o.offset + o.width / 2}
            y={o.sill}
            z={-WALL_THICKNESS / 2}
          />
        ))}
      </primitive>
    </group>
  );
});

function OpeningAnchor(props: { id: OpeningId; x: number; y: number; z: number }) {
  const register = useRegisterEntity(props.id);
  return <group ref={register} position={[props.x, props.y, props.z]} />;
}

const view = new Vector3();
/** Wall opacity under which its doors and windows are hidden (and cannot be picked). */
const OPENINGS_HIDDEN_BELOW = 0.5;
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
  openings: RefObject<WallGroups>;
  roomHeight: number;
}) {
  const { walls, materials, openings, roomHeight } = props;
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
      // Doors and windows of a faded wall would float in the air: they go with it.
      const fittings = openings.current[wall];
      if (fittings) fittings.visible = material.opacity > OPENINGS_HIDDEN_BELOW;
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
  meshRef?: (mesh: Mesh | null) => void;
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
      ref={props.meshRef ?? null}
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
