import { z } from 'zod/mini';
import { ObjectIdSchema, OpeningIdSchema, RoomIdSchema } from './ids';
import { LIMITS } from './limits';
import type { DeepReadonly } from './readonly';

// Zod 4 numbers are finite: NaN and ±Infinity are rejected everywhere (I7).

// ── Primitives ──────────────────────────────────────────────────

export type HexColor = `#${string}`;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const HexColorSchema = z.custom<HexColor>(
  (value) => typeof value === 'string' && HEX_COLOR.test(value),
  'Expected a #rrggbb color',
);

/** A number in [min, max] (`z.number().min().max()` in classic zod). */
const between = (min: number, max: number) => z.number().check(z.gte(min), z.lte(max));
/** A number in (0, max]. */
const positiveUpTo = (max: number) => z.number().check(z.positive(), z.lte(max));

const unit = between(0, 1);
const coordinate = between(-LIMITS.maxCoordinate, LIMITS.maxCoordinate);
const name = z
  .string()
  .check(z.maxLength(LIMITS.maxNameLength, `Must be at most ${LIMITS.maxNameLength} characters`));
const key = z.string().check(z.minLength(1), z.maxLength(LIMITS.maxKeyLength));

export const Vec2Schema = z.tuple([coordinate, coordinate]);
export const Vec3Schema = z.tuple([coordinate, coordinate, coordinate]);
export type Vec2 = z.infer<typeof Vec2Schema>;
export type Vec3 = z.infer<typeof Vec3Schema>;

export const WALL_IDS = ['north', 'east', 'south', 'west'] as const;
export const WallIdSchema = z.enum(WALL_IDS);
export type WallId = z.infer<typeof WallIdSchema>;

// ── Materials and lights ────────────────────────────────────────

export const MaterialRefSchema = z.object({
  presetId: key,
  tint: z.exactOptional(HexColorSchema),
  roughness: z.exactOptional(unit),
  metalness: z.exactOptional(unit),
});
export type MaterialRef = z.infer<typeof MaterialRefSchema>;

export const SurfaceSchema = z.object({ material: MaterialRefSchema });
export type Surface = z.infer<typeof SurfaceSchema>;

const speed = positiveUpTo(LIMITS.maxEffectSpeed);
export const LightEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('static') }),
  z.object({ kind: z.literal('breathing'), speed }),
  z.object({
    kind: z.literal('cycle'),
    speed,
    palette: z.exactOptional(
      z.array(HexColorSchema).check(z.minLength(1), z.maxLength(LIMITS.maxPaletteColors)),
    ),
  }),
]);

export const LightStateSchema = z.object({
  on: z.boolean(),
  color: HexColorSchema,
  intensity: unit,
  effect: LightEffectSchema,
});
export type LightState = z.infer<typeof LightStateSchema>;

export const LightingSchema = z.object({
  mode: z.enum(['day', 'night']),
  ambient: unit,
  sunAzimuth: between(0, 360),
});
export type Lighting = z.infer<typeof LightingSchema>;

// ── Rooms and openings ──────────────────────────────────────────

const roomSide = between(LIMITS.roomSide.min, LIMITS.roomSide.max);

export const RoomSchema = z.object({
  id: RoomIdSchema,
  name,
  // Discriminated from day one so `polygon` can be added with a migration (DOMAIN_MODEL §8).
  shape: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('rect'), width: roomSide, depth: roomSide }),
  ]),
  height: between(LIMITS.roomHeight.min, LIMITS.roomHeight.max),
  origin: Vec2Schema,
  floor: SurfaceSchema,
  ceiling: SurfaceSchema,
  walls: z.object({
    north: SurfaceSchema,
    east: SurfaceSchema,
    south: SurfaceSchema,
    west: SurfaceSchema,
  }),
});
export type Room = z.infer<typeof RoomSchema>;

const openingSize = positiveUpTo(LIMITS.roomSide.max);

// Fitting inside the wall and not overlapping other openings (I4) needs the room: see invariants.
export const OpeningSchema = z
  .object({
    id: OpeningIdSchema,
    roomId: RoomIdSchema,
    wall: WallIdSchema,
    kind: z.enum(['door', 'window']),
    variant: key,
    offset: between(0, LIMITS.roomSide.max),
    width: openingSize,
    height: openingSize,
    sill: between(0, LIMITS.roomHeight.max),
  })
  .check(
    z.refine((opening) => opening.kind !== 'door' || opening.sill === 0, {
      message: 'A door must start at floor level (sill 0)',
      path: ['sill'],
    }),
  );
export type Opening = z.infer<typeof OpeningSchema>;

// ── Placed objects ──────────────────────────────────────────────

export const TransformSchema = z.object({
  position: Vec3Schema,
  rotationY: z.number(),
  scale: z.exactOptional(
    z.tuple([
      positiveUpTo(LIMITS.maxScale),
      positiveUpTo(LIMITS.maxScale),
      positiveUpTo(LIMITS.maxScale),
    ]),
  ),
});

function boundedRecord<T extends z.ZodMiniType>(value: T, max: number) {
  return z
    .record(key, value)
    .check(z.refine((record) => Object.keys(record).length <= max, `At most ${max} entries`));
}

export const PlacedObjectSchema = z.object({
  id: ObjectIdSchema,
  catalogId: key,
  name: z.exactOptional(name),
  roomId: RoomIdSchema,
  parentId: z.nullable(ObjectIdSchema),
  transform: TransformSchema,
  materials: boundedRecord(MaterialRefSchema, LIMITS.maxMaterialSlots),
  light: z.exactOptional(LightStateSchema),
  params: z.exactOptional(
    boundedRecord(
      z.union([
        z.number(),
        z.string().check(z.maxLength(LIMITS.maxParamStringLength)),
        z.boolean(),
      ]),
      LIMITS.maxParams,
    ),
  ),
  locked: z.boolean(),
  hidden: z.boolean(),
});
export type PlacedObject = z.infer<typeof PlacedObjectSchema>;

// ── Document ────────────────────────────────────────────────────

export const SCHEMA_VERSION = 1;

export const SceneDocumentSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    units: z.literal('m'),
    rooms: z.record(RoomIdSchema, RoomSchema),
    roomOrder: z.array(RoomIdSchema),
    openings: z.record(OpeningIdSchema, OpeningSchema),
    objects: z.record(ObjectIdSchema, PlacedObjectSchema),
    objectOrder: z.array(ObjectIdSchema),
    lighting: LightingSchema,
  })
  .check(
    z.superRefine((doc, ctx) => {
      for (const { path, message } of documentStructureIssues(doc)) {
        ctx.addIssue({ code: 'custom', path, message });
      }
    }),
  );
export type SceneDocument = z.infer<typeof SceneDocumentSchema>;

export interface DocumentIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Document-wide structure (I1 and count limits): map keys are entity ids, ids are unique across
 * maps, order lists name every entity once, references exist. Shared by the schema (imports) and
 * the session invariants (after every command). Cycles and depth (I2) live with the invariants.
 */
export function documentStructureIssues(doc: DeepReadonly<SceneDocument>): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  const issue = (path: (string | number)[], message: string) => issues.push({ path, message });

  const seen = new Set<string>();
  for (const map of ['rooms', 'openings', 'objects'] as const) {
    for (const [id, entity] of Object.entries(doc[map])) {
      if (entity.id !== id) issue([map, id, 'id'], `Id "${entity.id}" does not match its key`);
      if (seen.has(id)) issue([map, id], `Duplicate id "${id}"`);
      seen.add(id);
    }
  }

  checkOrder(doc.roomOrder, doc.rooms, 'roomOrder', issue);
  checkOrder(doc.objectOrder, doc.objects, 'objectOrder', issue);

  if (Object.keys(doc.rooms).length > LIMITS.maxRooms) {
    issue(['rooms'], `At most ${LIMITS.maxRooms} rooms`);
  }
  if (Object.keys(doc.objects).length > LIMITS.maxObjects) {
    issue(['objects'], `At most ${LIMITS.maxObjects} objects`);
  }

  for (const [id, object] of Object.entries(doc.objects)) {
    if (!Object.hasOwn(doc.rooms, object.roomId)) {
      issue(['objects', id, 'roomId'], `References unknown room "${object.roomId}"`);
    }
    if (object.parentId === object.id) {
      issue(['objects', id, 'parentId'], 'An object cannot be its own parent');
    } else if (object.parentId !== null && !Object.hasOwn(doc.objects, object.parentId)) {
      issue(['objects', id, 'parentId'], `References unknown parent "${object.parentId}"`);
    }
  }

  const perWall = new Map<string, number>();
  for (const [id, opening] of Object.entries(doc.openings)) {
    if (!Object.hasOwn(doc.rooms, opening.roomId)) {
      issue(['openings', id, 'roomId'], `References unknown room "${opening.roomId}"`);
    }
    const wallKey = `${opening.roomId}:${opening.wall}`;
    const count = (perWall.get(wallKey) ?? 0) + 1;
    perWall.set(wallKey, count);
    if (count === LIMITS.maxOpeningsPerWall + 1) {
      issue(
        ['openings', id],
        `At most ${LIMITS.maxOpeningsPerWall} openings on the ${opening.wall} wall of room "${opening.roomId}"`,
      );
    }
  }
  return issues;
}

/** An order list must name every entity of its map exactly once. */
function checkOrder(
  order: readonly string[],
  map: Readonly<Record<string, unknown>>,
  field: 'roomOrder' | 'objectOrder',
  issue: (path: (string | number)[], message: string) => void,
) {
  const listed = new Set<string>();
  order.forEach((id, index) => {
    if (listed.has(id)) issue([field, index], `${field} lists "${id}" more than once`);
    else if (!Object.hasOwn(map, id)) issue([field, index], `${field} lists unknown id "${id}"`);
    listed.add(id);
  });
  for (const id of Object.keys(map)) {
    if (!listed.has(id)) issue([field], `${field} is missing "${id}"`);
  }
}

export type ParseResult = { ok: true; document: SceneDocument } | { ok: false; errors: string[] };

/**
 * Validates untrusted input (imports, share links, storage) without throwing.
 * Errors read `path: message`, e.g. `rooms.abc.height: Too big: expected number to be <=4`.
 */
export function parseSceneDocument(input: unknown): ParseResult {
  const result = SceneDocumentSchema.safeParse(input);
  if (result.success) return { ok: true, document: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) =>
      issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    ),
  };
}
