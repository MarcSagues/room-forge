import { current, type Draft } from 'immer';
import { z } from 'zod/mini';
import {
  LIMITS,
  type ObjectId,
  type PlacedObject,
  PlacedObjectSchema,
  type RoomId,
  type SceneDocument,
  type Vec3,
  Vec3Schema,
} from '../domain';
import { normalizeAngle, solvePlacement } from '../geometry';
import type { CatalogProvider } from '../ports';
import type { Command, CommandError } from '../session';

/** Default shift of a duplicate on the floor plane, `[dx, dz]` in metres. */
export const DUPLICATE_OFFSET: readonly [number, number] = [0.25, 0.25];

type Params = NonNullable<PlacedObject['params']>;

const invalid = (message: string): CommandError => ({ code: 'invalid', message });
const notFound = (id: string): CommandError => ({
  code: 'not-found',
  message: `No object "${id}"`,
});
const limitReached = (): CommandError => ({
  code: 'limit-reached',
  message: `A design can hold at most ${LIMITS.maxObjects} objects`,
});

function describeIssues(error: z.core.$ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    )
    .join('; ');
}

const finite = z.number();
const scaleSchema = PlacedObjectSchema.shape.transform.shape.scale.def.innerType;

/**
 * Floor objects (catalog default surface `floor`, no parent) are kept inside their room: the
 * nearest legal centre for the requested one. Objects on other surfaces, on a parent, or unknown to
 * the catalog (I6) are left where they were asked to go; the invariants still check them.
 */
function placeOnFloor(
  draft: Draft<SceneDocument>,
  catalog: CatalogProvider,
  object: Pick<PlacedObject, 'catalogId' | 'roomId' | 'parentId' | 'transform'>,
): CommandError | Vec3 {
  const [x, y, zPos] = object.transform.position;
  const item = catalog.getItem(object.catalogId);
  const room = draft.rooms[object.roomId];
  if (object.parentId !== null || !item || !room || item.placement.surfaces[0] !== 'floor') {
    return [x, y, zPos];
  }
  const [sx, , sz] = object.transform.scale ?? [1, 1, 1];
  const solved = solvePlacement({
    room: room.shape,
    size: { w: item.size.w * sx, d: item.size.d * sz },
    position: [x, zPos],
    rotationY: object.transform.rotationY,
    wallSnap: false,
  });
  if (!solved.valid) return invalid(`"${object.catalogId}" does not fit in room "${room.id}"`);
  return [solved.position[0], y, solved.position[1]];
}

// ── object/add ──────────────────────────────────────────────────

export interface AddObjectInput {
  id?: string;
  catalogId: string;
  roomId: RoomId;
  parentId?: ObjectId | null;
  /** Room-local for floor objects, local to the parent otherwise. */
  position: Vec3;
  rotationY: number;
  scale?: Vec3;
  name?: string;
  materials?: PlacedObject['materials'];
  params?: Params;
}

/**
 * `object/add`. Policy: a floor object asked to stand partly outside its room is moved to the
 * nearest position inside; if it cannot fit at all the command fails with `invalid`. Reaching
 * the object limit fails with `limit-reached`.
 */
export function addObject(input: AddObjectInput): Command {
  return {
    type: 'object/add',
    label: 'Add object',
    apply(draft, ctx) {
      if (draft.objectOrder.length >= LIMITS.maxObjects) return limitReached();
      if (!Object.hasOwn(draft.rooms, input.roomId)) {
        return { code: 'not-found', message: `No room "${input.roomId}"` };
      }
      const parentId = input.parentId ?? null;
      if (parentId !== null && !Object.hasOwn(draft.objects, parentId)) return notFound(parentId);
      const id = (input.id ?? ctx.idGen()) as ObjectId;
      if (Object.hasOwn(draft.objects, id)) return invalid(`Id "${id}" is already in use`);

      const candidate = PlacedObjectSchema.safeParse({
        id,
        catalogId: input.catalogId,
        roomId: input.roomId,
        parentId,
        transform: {
          position: input.position,
          rotationY: normalizeAngle(input.rotationY),
          ...(input.scale === undefined ? {} : { scale: input.scale }),
        },
        materials: input.materials ?? {},
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.params === undefined ? {} : { params: input.params }),
        locked: false,
        hidden: false,
      });
      if (!candidate.success) return invalid(describeIssues(candidate.error));
      const object = candidate.data;
      const placed = placeOnFloor(draft, ctx.catalog, object);
      if (!Array.isArray(placed)) return placed;
      object.transform.position = placed;
      draft.objects[id] = object;
      draft.objectOrder.push(id);
    },
  };
}

// ── object/move, object/rotate ──────────────────────────────────

const mergeKeyFor = (type: string, ids: readonly string[]) =>
  `${type}:${[...ids].sort().join(',')}`;

/**
 * Looks up every id, or fails without touching the draft. Lists must not be empty: commands take
 * arrays from day one so multi-selection needs no new commands.
 */
function targets(draft: Draft<SceneDocument>, ids: readonly ObjectId[]) {
  if (ids.length === 0) return invalid('No objects given');
  const found: Draft<PlacedObject>[] = [];
  for (const id of ids) {
    const object = draft.objects[id];
    if (!object) return notFound(id);
    found.push(object);
  }
  return found;
}

/**
 * `object/move`: absolute positions (room-local, or local to the parent) and, optionally, the
 * rotation a wall snap chose during the same drag. No clamping: drag
 * controllers already solve a legal position, so an illegal one is rejected by the invariants
 * and the document stays as it was. Consecutive moves of the same objects coalesce.
 */
export function moveObjects(
  moves: readonly { id: ObjectId; position: Vec3; rotationY?: number }[],
): Command {
  const ids = moves.map((move) => move.id);
  return {
    type: 'object/move',
    label: 'Move object',
    mergeKey: mergeKeyFor('object/move', ids),
    apply(draft) {
      const found = targets(draft, ids);
      if (!Array.isArray(found)) return found;
      for (const [index, move] of moves.entries()) {
        const position = Vec3Schema.safeParse(move.position);
        if (!position.success) return invalid(describeIssues(position.error));
        const target = found[index] as Draft<PlacedObject>;
        target.transform.position = position.data;
        // A drag that snapped to a wall also turns the object: same gesture, same command.
        if (move.rotationY !== undefined) {
          const angle = finite.safeParse(move.rotationY);
          if (!angle.success) return invalid(describeIssues(angle.error));
          target.transform.rotationY = normalizeAngle(angle.data);
        }
      }
    },
  };
}

/** `object/rotate`: absolute rotations about Y, normalised to (-π, π]. Coalesces like moves. */
export function rotateObjects(rotations: readonly { id: ObjectId; rotationY: number }[]): Command {
  const ids = rotations.map((rotation) => rotation.id);
  return {
    type: 'object/rotate',
    label: 'Rotate object',
    mergeKey: mergeKeyFor('object/rotate', ids),
    apply(draft) {
      const found = targets(draft, ids);
      if (!Array.isArray(found)) return found;
      for (const [index, rotation] of rotations.entries()) {
        const angle = finite.safeParse(rotation.rotationY);
        if (!angle.success) return invalid(describeIssues(angle.error));
        (found[index] as Draft<PlacedObject>).transform.rotationY = normalizeAngle(angle.data);
      }
    },
  };
}

// ── object/setProps ─────────────────────────────────────────────

export interface ObjectProps {
  /** `null` removes the custom name. */
  name?: string | null;
  locked?: boolean;
  hidden?: boolean;
  /** `null` resets the scale to 1. */
  scale?: Vec3 | null;
  /** Merged into the existing params. */
  params?: Params;
}

const PropsSchema = z.object({
  name: z.optional(z.nullable(PlacedObjectSchema.shape.name.def.innerType)),
  locked: z.optional(z.boolean()),
  hidden: z.optional(z.boolean()),
  scale: z.optional(z.nullable(scaleSchema)),
  params: z.optional(PlacedObjectSchema.shape.params.def.innerType),
});

/** `object/setProps`: the same props on every given object. Coalesces per objects and keys. */
export function setObjectProps(ids: readonly ObjectId[], props: ObjectProps): Command {
  return {
    type: 'object/setProps',
    label: 'Change object',
    mergeKey: `${mergeKeyFor('object/setProps', ids)}:${Object.keys(props).sort().join(',')}`,
    apply(draft) {
      const parsed = PropsSchema.safeParse(props);
      if (!parsed.success) return invalid(describeIssues(parsed.error));
      const found = targets(draft, ids);
      if (!Array.isArray(found)) return found;
      const { name, locked, hidden, scale, params } = parsed.data;
      for (const object of found) {
        if (name === null) delete object.name;
        else if (name !== undefined) object.name = name;
        if (locked !== undefined) object.locked = locked;
        if (hidden !== undefined) object.hidden = hidden;
        if (scale === null) delete object.transform.scale;
        else if (scale !== undefined) object.transform.scale = scale;
        if (params !== undefined) object.params = { ...object.params, ...params };
      }
    },
  };
}

// ── object/remove ───────────────────────────────────────────────

/** The given objects plus everything standing on them, in outliner order. */
function withDescendants(draft: Draft<SceneDocument>, ids: readonly ObjectId[]): ObjectId[] {
  const included = new Set<string>(ids);
  // Depth is at most 2 (I2), but follow chains generically: repeat until nothing is added.
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of draft.objectOrder) {
      const parent = draft.objects[id]?.parentId;
      if (parent && included.has(parent) && !included.has(id)) {
        included.add(id);
        grew = true;
      }
    }
  }
  return draft.objectOrder.filter((id) => included.has(id));
}

/**
 * `object/remove`. Policy: objects standing on a removed object are removed with it (a monitor
 * goes with its desk). Selection and hover are reconciled by the session.
 */
export function removeObjects(ids: readonly ObjectId[]): Command {
  return {
    type: 'object/remove',
    label: 'Delete object',
    apply(draft) {
      const found = targets(draft, ids);
      if (!Array.isArray(found)) return found;
      const removed = new Set<string>(withDescendants(draft, ids));
      for (const id of removed) delete draft.objects[id as ObjectId];
      draft.objectOrder = draft.objectOrder.filter((id) => !removed.has(id));
    },
  };
}

// ── object/duplicate ────────────────────────────────────────────

/**
 * `object/duplicate`. The objects standing on a duplicated object are copied too, and their copies
 * stand on the parent's copy (same local transform). A copy whose parent is not duplicated stays
 * on that same parent. Copies are shifted by `offset` (floor plane) and floor objects are kept
 * inside the room. Fails with `limit-reached` if the copies would exceed the object limit.
 */
export function duplicateObjects(
  ids: readonly ObjectId[],
  options: { offset?: readonly [number, number] } = {},
): Command {
  const [dx, dz] = options.offset ?? DUPLICATE_OFFSET;
  return {
    type: 'object/duplicate',
    label: 'Duplicate object',
    apply(draft, ctx) {
      const found = targets(draft, ids);
      if (!Array.isArray(found)) return found;
      const sources = withDescendants(draft, ids);
      if (draft.objectOrder.length + sources.length > LIMITS.maxObjects) return limitReached();

      const copies = new Map<ObjectId, ObjectId>();
      for (const id of sources) copies.set(id, ctx.idGen() as ObjectId);
      for (const sourceId of sources) {
        const source = JSON.parse(JSON.stringify(current(draft.objects[sourceId]))) as PlacedObject;
        const copyId = copies.get(sourceId) as ObjectId;
        const parentCopy = source.parentId === null ? undefined : copies.get(source.parentId);
        const object: PlacedObject = {
          ...source,
          id: copyId,
          parentId: parentCopy ?? source.parentId,
        };
        if (!parentCopy) {
          const [x, y, zPos] = source.transform.position;
          object.transform = { ...source.transform, position: [x + dx, y, zPos + dz] };
          const placed = placeOnFloor(draft, ctx.catalog, object);
          if (!Array.isArray(placed)) return placed;
          object.transform.position = placed;
        }
        draft.objects[copyId] = object;
        draft.objectOrder.push(copyId);
      }
    },
  };
}

// ── object/reorder ──────────────────────────────────────────────

/**
 * `object/reorder`: moves `id` to `index` in `objectOrder` (the outliner order), keeping the
 * others in their order. Order only: nothing moves in the scene. Repeated moves of the same
 * object coalesce, so stepping it up several rows is one entry.
 */
export function reorderObject(id: ObjectId, index: number): Command {
  return {
    type: 'object/reorder',
    label: 'Reorder object',
    mergeKey: `object/reorder:${id}`,
    apply(draft) {
      const from = draft.objectOrder.indexOf(id);
      if (from === -1) return notFound(id);
      if (!Number.isInteger(index) || index < 0 || index >= draft.objectOrder.length) {
        return invalid(`Index ${index} is outside the object list`);
      }
      if (from === index) return;
      const order = draft.objectOrder.filter((other) => other !== id);
      order.splice(index, 0, id);
      // One replace patch for the whole list instead of a patch per shifted entry.
      draft.objectOrder = order;
    },
  };
}
