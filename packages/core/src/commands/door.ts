import type { Draft } from 'immer';
import {
  type DeepReadonly,
  type DoorHinge,
  type DoorSwing,
  type ObjectId,
  type Opening,
  type OpeningId,
  OpeningSchema,
  type SceneDocument,
} from '../domain';
import {
  doorMaxOpen,
  doorSweepBox,
  doorSweepFits,
  type FloorBox,
  footprintExtents,
} from '../geometry';
import type { CatalogProvider } from '../ports';
import type { Command, CommandError } from '../session';

const invalid = (message: string): CommandError => ({ code: 'invalid', message });

/**
 * Changes one door, then checks the result: the fields against the schema and the leaf against
 * the walls (`blocked`, DOMAIN_MODEL §8.1). Objects in the way never block: see
 * `doorSweepObstacles`.
 */
function updateDoor(
  draft: Draft<SceneDocument>,
  id: OpeningId,
  change: (door: Opening) => Opening,
): CommandError | undefined {
  const current = draft.openings[id];
  if (!current) return { code: 'not-found', message: `No opening "${id}"` };
  if (current.kind !== 'door') return invalid(`"${id}" is a window: only doors open`);
  const room = draft.rooms[current.roomId];
  if (!room) return { code: 'not-found', message: `No room "${current.roomId}"` };
  const parsed = OpeningSchema.safeParse(change({ ...current }));
  if (!parsed.success) {
    return invalid(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  if (!doorSweepFits(room.shape, parsed.data)) {
    return { code: 'blocked', message: 'The door leaf would cross the opposite wall' };
  }
  // Field by field, so the patches name what changed (`openings.<id>.open`), not the whole door.
  Object.assign(current, parsed.data);
  return undefined;
}

/**
 * `opening/setOpen`: how far a door is open, 0 (closed) … 1 (90°). Repeated changes of the same
 * door coalesce (`mergeKey`), so a burst of toggles or a slider drag is one history entry.
 */
export function setDoorOpen(id: OpeningId, open: number): Command {
  return {
    type: 'opening/setOpen',
    label: open > 0 ? 'Open door' : 'Close door',
    mergeKey: `opening/setOpen:${id}`,
    apply: (draft) => updateDoor(draft, id, (door) => ({ ...door, open })),
  };
}

/**
 * `opening/setOpen` that closes an open door and opens a closed one as far as it goes: fully, or
 * up to the opposite wall in a room shallower than the leaf, so a toggle is never refused.
 */
export function toggleDoor(id: OpeningId): Command {
  return {
    type: 'opening/setOpen',
    label: 'Open or close door',
    mergeKey: `opening/setOpen:${id}`,
    apply: (draft) =>
      updateDoor(draft, id, (door) => {
        const room = draft.rooms[door.roomId];
        const widest = room ? doorMaxOpen(room.shape, door) : 1;
        return { ...door, open: (door.open ?? 0) > 0 ? 0 : widest };
      }),
  };
}

/** `opening/setSwing`: which way the leaf opens and on which jamb it hinges. */
export function setDoorSwing(
  id: OpeningId,
  change: { swing?: DoorSwing; hinge?: DoorHinge },
): Command {
  return {
    type: 'opening/setSwing',
    label: 'Change door swing',
    mergeKey: `opening/setSwing:${id}`,
    apply(draft) {
      if (change.swing === undefined && change.hinge === undefined) {
        return invalid('Nothing to change');
      }
      return updateDoor(draft, id, (door) => ({
        ...door,
        ...(change.swing === undefined ? {} : { swing: change.swing }),
        ...(change.hinge === undefined ? {} : { hinge: change.hinge }),
      }));
    },
  };
}

const sweep: FloorBox = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
const extents: [number, number] = [0, 0];

/**
 * Floor objects of the door's room whose footprint (its bounding box on the floor) overlaps the
 * area the open leaf sweeps. A warning for the UI, never a reason to refuse the change: furniture
 * moves, and a door should not get stuck behind it (ADR-0012). Empty for windows, closed doors and
 * doors opening outwards.
 */
export function doorSweepObstacles(
  doc: DeepReadonly<SceneDocument>,
  catalog: CatalogProvider,
  id: OpeningId,
): ObjectId[] {
  const door = doc.openings[id];
  const room = door && doc.rooms[door.roomId];
  if (!door || !room || door.kind !== 'door') return [];
  const box = doorSweepBox(room.shape, door, sweep);
  if (!box) return [];
  const hits: ObjectId[] = [];
  for (const objectId of doc.objectOrder) {
    const object = doc.objects[objectId];
    if (!object || object.roomId !== room.id || object.parentId !== null || object.hidden) continue;
    const item = catalog.getItem(object.catalogId);
    if (!item || item.placement.surfaces[0] !== 'floor') continue;
    const [x, , z] = object.transform.position;
    const [sx, , sz] = object.transform.scale ?? [1, 1, 1];
    const [ex, ez] = footprintExtents(
      item.size.w * sx,
      item.size.d * sz,
      object.transform.rotationY,
      extents,
    );
    const apart =
      x + ex <= box.minX || x - ex >= box.maxX || z + ez <= box.minZ || z - ez >= box.maxZ;
    if (!apart) hits.push(objectId);
  }
  return hits;
}
