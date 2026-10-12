import { createEmptyDocument } from '../domain/document';
import type { ObjectId, OpeningId, RoomId } from '../domain/ids';
import type { MaterialRef, Opening, PlacedObject, Room, SceneDocument } from '../domain/schemas';

/** Overrides may use plain strings for ids so tests stay readable (`roomId: 'room-1'`). */
type Overrides<T> = Partial<Omit<T, 'id' | 'roomId' | 'parentId'>> & {
  id?: string;
  roomId?: string;
  parentId?: string | null;
};

const paint = (presetId = 'paint.matte'): { material: MaterialRef } => ({ material: { presetId } });

/** A valid 4 × 3 × 2.6 m room with default surfaces. */
export function buildRoom(overrides: Overrides<Room> = {}): Room {
  const { id = 'room-1', ...rest } = overrides;
  return {
    name: 'Room',
    shape: { kind: 'rect', width: 4, depth: 3 },
    height: 2.6,
    origin: [0, 0],
    floor: paint('floor.oak'),
    ceiling: paint(),
    walls: { north: paint(), east: paint(), south: paint(), west: paint() },
    ...rest,
    id: id as RoomId,
  };
}

/** A valid 0.9 m door on the south wall of `room-1`. */
export function buildOpening(overrides: Overrides<Opening> = {}): Opening {
  const { id = 'door-1', roomId = 'room-1', ...rest } = overrides;
  return {
    wall: 'south',
    kind: 'door',
    variant: 'door.single',
    offset: 0.5,
    width: 0.9,
    height: 2.1,
    sill: 0,
    ...rest,
    id: id as OpeningId,
    roomId: roomId as RoomId,
    // Door state last, as the schema has it: a door is a window's shape plus three fields.
    ...(rest.kind === 'window'
      ? {}
      : { swing: rest.swing ?? 'in', hinge: rest.hinge ?? 'left', open: rest.open ?? 0 }),
  };
}

/** A valid floor object at the centre of `room-1`. */
export function buildObject(overrides: Overrides<PlacedObject> = {}): PlacedObject {
  const { id = 'object-1', roomId = 'room-1', parentId = null, ...rest } = overrides;
  return {
    catalogId: 'desk.basic.120',
    transform: { position: [2, 0, 1.5], rotationY: 0 },
    materials: {},
    locked: false,
    hidden: false,
    ...rest,
    id: id as ObjectId,
    roomId: roomId as RoomId,
    parentId: parentId as ObjectId | null,
  };
}

/** A small valid scene: one room, a door and a window, and a monitor standing on a desk. */
export function buildDocument(): SceneDocument {
  const room = buildRoom();
  const door = buildOpening();
  const window = buildOpening({
    id: 'window-1',
    wall: 'north',
    kind: 'window',
    sill: 0.9,
    height: 1.2,
  });
  const desk = buildObject({ id: 'desk-1' });
  const monitor = buildObject({
    id: 'monitor-1',
    catalogId: 'monitor.27',
    parentId: desk.id,
    transform: { position: [0, 0.75, -0.2], rotationY: 0 },
  });
  return {
    ...createEmptyDocument(),
    rooms: { [room.id]: room },
    roomOrder: [room.id],
    openings: { [door.id]: door, [window.id]: window },
    objects: { [desk.id]: desk, [monitor.id]: monitor },
    objectOrder: [desk.id, monitor.id],
  };
}
