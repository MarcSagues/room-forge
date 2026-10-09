import type { Patch } from 'immer';
import type { z } from 'zod';
import {
  type DeepReadonly,
  documentStructureIssues,
  LIMITS,
  LightingSchema,
  OpeningSchema,
  PlacedObjectSchema,
  type Room,
  RoomSchema,
  type SceneDocument,
  type WallId,
} from '../domain';
import { footprintInside, GEOMETRY_TOLERANCE } from '../geometry';
import type { CatalogProvider } from '../ports';

/**
 * Which rule a violation breaks (ARCHITECTURE §4.3). `schema` covers field values: ranges, room
 * limits (I5) and finite numbers (I7). Unknown catalog ids are never a violation (I6).
 */
export type InvariantId = 'schema' | 'I1' | 'I2' | 'I3' | 'I4';

export interface InvariantViolation {
  readonly invariant: InvariantId;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** Entities whose fields need re-validating; `full` re-validates everything (e.g. on load). */
export interface InvariantScope {
  full: boolean;
  lighting: boolean;
  rooms: Set<string>;
  openings: Set<string>;
  objects: Set<string>;
}

type Doc = DeepReadonly<SceneDocument>;

const ENTITY_MAPS = ['rooms', 'openings', 'objects'] as const;

export function touchedByPatches(patches: readonly Patch[]): InvariantScope {
  const scope: InvariantScope = {
    full: false,
    lighting: false,
    rooms: new Set(),
    openings: new Set(),
    objects: new Set(),
  };
  for (const { path } of patches) {
    const [section, id] = path;
    if (section === 'lighting') scope.lighting = true;
    else if (section === 'roomOrder' || section === 'objectOrder')
      continue; // structure is always checked
    else if (ENTITY_MAPS.includes(section as (typeof ENTITY_MAPS)[number]) && id !== undefined) {
      scope[section as (typeof ENTITY_MAPS)[number]].add(String(id));
    } else scope.full = true;
  }
  return scope;
}

/**
 * Checks the document invariants I1–I7 after a command. Structure (I1), stacking (I2) and geometry
 * (I3, I4) are checked on the whole document: they are cheap and a change in one entity can break
 * another (resizing a room can push objects out). Field values are validated for touched entities
 * only, unless no scope is given.
 */
export function checkInvariants(
  doc: Doc,
  catalog: CatalogProvider,
  scope?: InvariantScope,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  violations.push(...fieldViolations(doc, scope));
  for (const { path, message } of documentStructureIssues(doc)) {
    violations.push({ invariant: 'I1', path, message });
  }
  violations.push(...stackingViolations(doc));
  violations.push(...footprintViolations(doc, catalog));
  violations.push(...openingViolations(doc));
  return violations;
}

function fieldViolations(doc: Doc, scope: InvariantScope | undefined): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const validate = (schema: z.ZodType, value: unknown, base: (string | number)[]) => {
    const result = schema.safeParse(value);
    if (result.success) return;
    for (const issue of result.error.issues) {
      violations.push({
        invariant: 'schema',
        path: [...base, ...(issue.path as (string | number)[])],
        message: issue.message,
      });
    }
  };
  const all = !scope || scope.full;
  const schemas = { rooms: RoomSchema, openings: OpeningSchema, objects: PlacedObjectSchema };

  if (all || scope.lighting) validate(LightingSchema, doc.lighting, ['lighting']);
  for (const map of ENTITY_MAPS) {
    const ids = all ? Object.keys(doc[map]) : scope[map];
    for (const id of ids) {
      const entity = (doc[map] as Readonly<Record<string, unknown>>)[id];
      if (entity !== undefined) validate(schemas[map], entity, [map, id]);
    }
  }
  return violations;
}

/** I2: an object may rest on a floor-level object of its own room, and no deeper (MVP). */
function stackingViolations(doc: Doc): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const [id, object] of Object.entries(doc.objects)) {
    if (object.parentId === null || object.parentId === object.id) continue;
    const parent = doc.objects[object.parentId];
    if (!parent) continue; // reported by the structure check
    const path = ['objects', id, 'parentId'];
    if (parent.parentId !== null) {
      violations.push({
        invariant: 'I2',
        path,
        message: `Cannot stand on "${parent.id}", which itself stands on another object`,
      });
    }
    if (parent.roomId !== object.roomId) {
      violations.push({ invariant: 'I2', path, message: 'Parent is in another room' });
    }
  }
  return violations;
}

/** I3: the rotated, scaled footprint of a floor object stays inside its (rectangular) room. */
function footprintViolations(doc: Doc, catalog: CatalogProvider): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const [id, object] of Object.entries(doc.objects)) {
    if (object.parentId !== null) continue;
    const item = catalog.getItem(object.catalogId);
    const room = doc.rooms[object.roomId];
    if (!item || !room || item.placement.surfaces[0] !== 'floor') continue;

    const [x, , z] = object.transform.position;
    const [sx, , sz] = object.transform.scale ?? [1, 1, 1];
    const w = item.size.w * sx;
    const d = item.size.d * sz;
    if (!footprintInside(room.shape, x, z, w, d, object.transform.rotationY)) {
      violations.push({
        invariant: 'I3',
        path: ['objects', id, 'transform'],
        message: `"${id}" does not fit inside room "${room.id}"`,
      });
    }
  }
  return violations;
}

function wallLength(room: DeepReadonly<Room>, wall: WallId): number {
  return wall === 'north' || wall === 'south' ? room.shape.width : room.shape.depth;
}

/** I4: openings fit in their wall (length and height) and do not overlap on the same wall. */
function openingViolations(doc: Doc): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const t = GEOMETRY_TOLERANCE;
  const byWall = new Map<string, { id: string; start: number; end: number }[]>();

  for (const [id, opening] of Object.entries(doc.openings)) {
    const room = doc.rooms[opening.roomId];
    if (!room) continue; // reported by the structure check
    const end = opening.offset + opening.width;
    const margin = LIMITS.openingCornerMargin;
    if (opening.offset < margin - t || end > wallLength(room, opening.wall) - margin + t) {
      violations.push({
        invariant: 'I4',
        path: ['openings', id],
        message: `"${id}" must stay ${margin * 100} cm away from the corners of the ${opening.wall} wall`,
      });
    }
    if (opening.sill + opening.height > room.height + t) {
      violations.push({
        invariant: 'I4',
        path: ['openings', id],
        message: `"${id}" is taller than the room`,
      });
    }
    const key = `${opening.roomId}:${opening.wall}`;
    const list = byWall.get(key) ?? [];
    list.push({ id, start: opening.offset, end });
    byWall.set(key, list);
  }

  for (const list of byWall.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i += 1) {
      const previous = list[i - 1];
      const current = list[i];
      if (previous && current && current.start < previous.end - t) {
        violations.push({
          invariant: 'I4',
          path: ['openings', current.id],
          message: `"${current.id}" overlaps "${previous.id}"`,
        });
      }
    }
  }
  return violations;
}
