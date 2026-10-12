import type { Draft } from 'immer';
import {
  LIMITS,
  type Opening,
  type OpeningId,
  OpeningSchema,
  type Room,
  type RoomId,
  type SceneDocument,
  type WallId,
} from '../domain';
import { GEOMETRY_TOLERANCE } from '../geometry';
import type { Command, CommandError } from '../session';

/** Default sizes of the MVP variants (metres). Windows sit on a sill; doors start at the floor. */
export const OPENING_VARIANTS = {
  'door.single': { kind: 'door', width: 0.9, height: 2.1, sill: 0 },
  'door.double': { kind: 'door', width: 1.6, height: 2.1, sill: 0 },
  'window.standard': { kind: 'window', width: 1, height: 1.2, sill: 0.9 },
  'window.large': { kind: 'window', width: 1.8, height: 1.4, sill: 0.7 },
} as const satisfies Record<
  string,
  { kind: Opening['kind']; width: number; height: number; sill: number }
>;

export type OpeningVariant = keyof typeof OPENING_VARIANTS;

const CLOSED_DOOR = { swing: 'in', hinge: 'left', open: 0 } as const;

const invalid = (message: string): CommandError => ({ code: 'invalid', message });
const notFound = (id: string): CommandError => ({
  code: 'not-found',
  message: `No opening "${id}"`,
});

function wallLength(room: Draft<Room>, wall: WallId): number {
  return wall === 'north' || wall === 'south' ? room.shape.width : room.shape.depth;
}

/**
 * Fits an opening into its wall. Policy: the **position** is slid to the nearest valid offset (10 cm
 * clear of each corner); a **size** that cannot fit (too wide for the wall, taller than the room)
 * is rejected; overlapping another opening on the same wall is rejected with `overlap`. An opening
 * is never left invalid.
 */
function fitOpening(draft: Draft<SceneDocument>, opening: Opening): CommandError | Opening {
  const room = draft.rooms[opening.roomId];
  if (!room) return { code: 'not-found', message: `No room "${opening.roomId}"` };
  const margin = LIMITS.openingCornerMargin;
  const length = wallLength(room, opening.wall);
  // Slide first (a negative or too large offset is a position to fix, not an error), then validate.
  const offset = Math.min(Math.max(opening.offset, margin), length - margin - opening.width);
  const parsed = OpeningSchema.safeParse({
    ...opening,
    offset: Number.isFinite(offset) ? Math.max(offset, 0) : opening.offset,
  });
  if (!parsed.success) {
    return invalid(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  const fitted: Opening = parsed.data;
  if (fitted.width > length - 2 * margin + GEOMETRY_TOLERANCE) {
    return invalid(`The opening is wider than the ${fitted.wall} wall allows`);
  }
  if (fitted.sill + fitted.height > room.height + GEOMETRY_TOLERANCE) {
    return invalid('The opening is taller than the room');
  }

  const conflicts: OpeningId[] = [];
  for (const other of Object.values(draft.openings)) {
    if (other.id === opening.id || other.roomId !== opening.roomId || other.wall !== opening.wall) {
      continue;
    }
    const separate =
      fitted.offset + fitted.width <= other.offset + GEOMETRY_TOLERANCE ||
      other.offset + other.width <= fitted.offset + GEOMETRY_TOLERANCE;
    if (!separate) conflicts.push(other.id);
  }
  if (conflicts.length > 0) {
    return { code: 'overlap', message: 'The opening overlaps another one', conflicts };
  }
  return fitted;
}

const openingsOnWall = (
  draft: Draft<SceneDocument>,
  roomId: RoomId,
  wall: WallId,
  except?: string,
) =>
  Object.values(draft.openings).filter(
    (o) => o.roomId === roomId && o.wall === wall && o.id !== except,
  ).length;

// ── opening/add ─────────────────────────────────────────────────

export interface AddOpeningInput {
  id?: string;
  roomId: RoomId;
  wall: WallId;
  /** One of `OPENING_VARIANTS`; decides the kind and the default size. */
  variant: string;
  offset: number;
  width?: number;
  height?: number;
  sill?: number;
}

/** `opening/add`: a door or window of a known variant (see `fitOpening` for the policy). */
export function addOpening(input: AddOpeningInput): Command {
  return {
    type: 'opening/add',
    label: 'Add opening',
    apply(draft, ctx) {
      const defaults = OPENING_VARIANTS[input.variant as OpeningVariant] as
        | (typeof OPENING_VARIANTS)[OpeningVariant]
        | undefined;
      if (!defaults || !Object.hasOwn(OPENING_VARIANTS, input.variant)) {
        return invalid(`Unknown opening variant "${input.variant}"`);
      }
      if (openingsOnWall(draft, input.roomId, input.wall) >= LIMITS.maxOpeningsPerWall) {
        return {
          code: 'limit-reached',
          message: `A wall can hold at most ${LIMITS.maxOpeningsPerWall} openings`,
        };
      }
      const id = (input.id ?? ctx.idGen()) as OpeningId;
      if (Object.hasOwn(draft.openings, id)) return invalid(`Id "${id}" is already in use`);
      const fitted = fitOpening(draft, {
        id,
        roomId: input.roomId,
        wall: input.wall,
        kind: defaults.kind,
        variant: input.variant,
        offset: input.offset,
        width: input.width ?? defaults.width,
        height: input.height ?? defaults.height,
        sill: defaults.kind === 'door' ? 0 : (input.sill ?? defaults.sill),
        // New doors are closed, open into the room and hinge on the left (DOMAIN_MODEL §8.1).
        ...(defaults.kind === 'door' ? CLOSED_DOOR : {}),
      });
      if ('code' in fitted) return fitted;
      draft.openings[id] = fitted;
    },
  };
}

// ── opening/move, opening/resize ────────────────────────────────

function update(
  draft: Draft<SceneDocument>,
  id: OpeningId,
  change: (opening: Opening) => Opening,
): CommandError | undefined {
  const current = draft.openings[id];
  if (!current) return notFound(id);
  const next = change({ ...current });
  if (
    next.wall !== current.wall &&
    openingsOnWall(draft, next.roomId, next.wall, id) >= LIMITS.maxOpeningsPerWall
  ) {
    return {
      code: 'limit-reached',
      message: `A wall can hold at most ${LIMITS.maxOpeningsPerWall} openings`,
    };
  }
  const fitted = fitOpening(draft, next);
  if ('code' in fitted) return fitted;
  draft.openings[id] = fitted;
  return undefined;
}

/**
 * `opening/move`: slides along its wall or onto another one of the same room; the offset is
 * clamped to the wall. Consecutive moves of the same opening coalesce.
 */
export function moveOpening(id: OpeningId, to: { offset: number; wall?: WallId }): Command {
  return {
    type: 'opening/move',
    label: 'Move opening',
    mergeKey: `opening/move:${id}`,
    apply: (draft) =>
      update(draft, id, (opening) => ({
        ...opening,
        offset: to.offset,
        wall: to.wall ?? opening.wall,
      })),
  };
}

/** `opening/resize`: width, height and (windows only) sill; the opening stays inside its wall. */
export function resizeOpening(
  id: OpeningId,
  size: { width?: number; height?: number; sill?: number },
): Command {
  return {
    type: 'opening/resize',
    label: 'Resize opening',
    mergeKey: `opening/resize:${id}`,
    apply: (draft) =>
      update(draft, id, (opening) => ({
        ...opening,
        width: size.width ?? opening.width,
        height: size.height ?? opening.height,
        sill: size.sill ?? opening.sill,
      })),
  };
}

// ── opening/remove ──────────────────────────────────────────────

export function removeOpenings(ids: readonly OpeningId[]): Command {
  return {
    type: 'opening/remove',
    label: 'Delete opening',
    apply(draft) {
      if (ids.length === 0) return invalid('No openings given');
      for (const id of ids) if (!draft.openings[id]) return notFound(id);
      for (const id of ids) delete draft.openings[id];
    },
  };
}
