import { current } from 'immer';
import { z } from 'zod';
import {
  LIMITS,
  type MaterialRef,
  MaterialRefSchema,
  type Room,
  type RoomId,
  RoomIdSchema,
  type WallId,
  WallIdSchema,
} from '../domain';
import { type Command, type CommandError, checkInvariants } from '../session';

export const DEFAULT_ROOM_MATERIALS = {
  floor: { presetId: 'floor.oak' },
  ceiling: { presetId: 'paint.matte' },
  wall: { presetId: 'paint.matte' },
} as const satisfies Record<string, MaterialRef>;

export type RoomSurface = 'floor' | 'ceiling' | WallId;

const side = z.number().min(LIMITS.roomSide.min).max(LIMITS.roomSide.max);
const height = z.number().min(LIMITS.roomHeight.min).max(LIMITS.roomHeight.max);

const CreateRoomInput = z.object({
  id: RoomIdSchema.optional(),
  name: z.string().max(LIMITS.maxNameLength),
  width: side,
  depth: side,
  height,
});
const ResizeInput = z.object({
  width: side.optional(),
  depth: side.optional(),
  height: height.optional(),
});

function invalid(error: z.ZodError): CommandError {
  const message = error.issues
    .map((issue) =>
      issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    )
    .join('; ');
  return { code: 'invalid', message };
}

const notFound = (id: string): CommandError => ({ code: 'not-found', message: `No room "${id}"` });

/**
 * `room/create`: adds a rectangular room centred on the world origin with default materials.
 * The name comes from the caller (UI text is translated there).
 */
export function createRoom(input: {
  id?: string;
  name: string;
  width: number;
  depth: number;
  height: number;
}): Command {
  return {
    type: 'room/create',
    label: 'Create room',
    apply(draft, ctx) {
      const parsed = CreateRoomInput.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const { name, width, depth } = parsed.data;
      const id = parsed.data.id ?? (ctx.idGen() as RoomId);
      if (Object.hasOwn(draft.rooms, id)) {
        return { code: 'invalid', message: `Id "${id}" is already in use` };
      }
      const wall = () => ({ material: { ...DEFAULT_ROOM_MATERIALS.wall } });
      const room: Room = {
        id,
        name,
        shape: { kind: 'rect', width, depth },
        height: parsed.data.height,
        origin: [-width / 2, -depth / 2],
        floor: { material: { ...DEFAULT_ROOM_MATERIALS.floor } },
        ceiling: { material: { ...DEFAULT_ROOM_MATERIALS.ceiling } },
        walls: { north: wall(), east: wall(), south: wall(), west: wall() },
      };
      draft.rooms[id] = room;
      draft.roomOrder.push(id);
    },
  };
}

/**
 * `room/resize`: changes width, depth and/or height. Objects and openings are measured from the
 * north-west corner, so shrinking can leave some outside; in that case the resize is blocked and
 * `error.conflicts` lists them (the UI explains it, #36).
 */
export function resizeRoom(
  roomId: RoomId,
  size: { width?: number; depth?: number; height?: number },
): Command {
  return {
    type: 'room/resize',
    label: 'Resize room',
    mergeKey: `room/resize:${roomId}`,
    apply(draft, ctx) {
      const parsed = ResizeInput.safeParse(size);
      if (!parsed.success) return invalid(parsed.error);
      const room = draft.rooms[roomId];
      if (!room) return notFound(roomId);

      const { width, depth, height: newHeight } = parsed.data;
      if (width !== undefined) room.shape.width = width;
      if (depth !== undefined) room.shape.depth = depth;
      if (newHeight !== undefined) room.height = newHeight;

      const conflicts = new Set<string>();
      for (const violation of checkInvariants(current(draft), ctx.catalog)) {
        if (violation.invariant !== 'I3' && violation.invariant !== 'I4') continue;
        const [, id] = violation.path;
        if (id !== undefined) conflicts.add(String(id));
      }
      if (conflicts.size > 0) {
        return {
          code: 'conflict',
          message: `Resizing would leave ${conflicts.size} item(s) outside the room`,
          conflicts: [...conflicts],
        };
      }
    },
  };
}

/** `room/setSurfaceMaterial`: floor, ceiling or a single wall. Repeated edits coalesce (colour picker). */
export function setSurfaceMaterial(
  roomId: RoomId,
  surface: RoomSurface,
  material: MaterialRef,
): Command {
  return {
    type: 'room/setSurfaceMaterial',
    label: 'Change room material',
    mergeKey: `room/setSurfaceMaterial:${roomId}:${surface}`,
    apply(draft) {
      const parsed = MaterialRefSchema.safeParse(material);
      if (!parsed.success) return invalid(parsed.error);
      const room = draft.rooms[roomId];
      if (!room) return notFound(roomId);
      const wall = WallIdSchema.safeParse(surface);
      if (wall.success) room.walls[wall.data].material = parsed.data;
      else if (surface === 'floor') room.floor.material = parsed.data;
      else room.ceiling.material = parsed.data;
    },
  };
}
