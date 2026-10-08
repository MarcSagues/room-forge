'use client';

import type { ObjectId, RoomId } from '@roomforge/core';
import { memo } from 'react';
import { useSessionState } from '../canvas/use-session-state';
import { useChildIds, useEntity, useEntityIds } from './entity-hooks';
import { useRegisterEntity } from './entity-registry';
import { placeholderResources } from './placeholder-resources';
import { countRender } from './render-count';

export const LIST_RENDER_KEY = 'ObjectList';
export const viewRenderKey = (id: ObjectId) => `ObjectView:${id}`;

/** Every object standing on a room. Re-renders only when that set of ids changes. */
export function ObjectList() {
  countRender(LIST_RENDER_KEY);
  const ids = useEntityIds();
  return (
    <>
      {ids.map((id) => (
        <RootObject key={id} id={id} />
      ))}
    </>
  );
}

/** A root object lives in its room's frame: offset by the room origin (two numbers, not the room). */
const RootObject = memo(function RootObject({ id }: { id: ObjectId }) {
  const roomId = useEntity(id, (object) => object.roomId);
  return roomId ? <RoomFrame roomId={roomId} id={id} /> : null;
});

function RoomFrame({ roomId, id }: { roomId: RoomId; id: ObjectId }) {
  const x = useSessionState((state) => state.document.rooms[roomId]?.origin[0] ?? 0);
  const z = useSessionState((state) => state.document.rooms[roomId]?.origin[1] ?? 0);
  return (
    <group position={[x, 0, z]}>
      <ObjectView id={id} />
    </group>
  );
}

/**
 * One object: subscribes to its own entry only, so moving it re-renders this view and nothing
 * else. Objects standing on it render inside its group (their transform is local to it).
 */
export const ObjectView = memo(function ObjectView({ id }: { id: ObjectId }) {
  countRender(viewRenderKey(id));
  const transform = useEntity(id, (object) => object.transform);
  const hidden = useEntity(id, (object) => object.hidden);
  const register = useRegisterEntity(id);
  if (!transform) return null;
  const { geometry, material } = placeholderResources();
  return (
    <group
      ref={register}
      name={id}
      position={transform.position}
      rotation-y={transform.rotationY}
      scale={transform.scale ?? 1}
      visible={hidden !== true}
    >
      <mesh geometry={geometry} material={material} dispose={null} />
      <ChildObjects parentId={id} />
    </group>
  );
});

function ChildObjects({ parentId }: { parentId: ObjectId }) {
  const ids = useChildIds(parentId);
  return (
    <>
      {ids.map((id) => (
        <ObjectView key={id} id={id} />
      ))}
    </>
  );
}
