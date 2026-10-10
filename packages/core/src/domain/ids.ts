import '../zod-config';
import { nanoid } from 'nanoid';
import { z } from 'zod/mini';

/** Length of generated ids: short so that share links stay small (DOMAIN_MODEL §1). */
export const ID_LENGTH = 10;

/** Ids are object keys in the document: these would hit the prototype instead of an own entry. */
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

/** URL-safe ids; longer than generated ones so test ids (`room-1`) and older formats still parse. */
export const IdSchema = z.string().check(
  z.regex(/^[A-Za-z0-9_-]{1,32}$/, 'Expected an id of 1 to 32 URL-safe characters'),
  z.refine((id) => !RESERVED_IDS.has(id), 'This id is reserved'),
);

export const ProjectIdSchema = IdSchema.brand<'ProjectId'>();
export const RoomIdSchema = IdSchema.brand<'RoomId'>();
export const ObjectIdSchema = IdSchema.brand<'ObjectId'>();
export const OpeningIdSchema = IdSchema.brand<'OpeningId'>();

export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type RoomId = z.infer<typeof RoomIdSchema>;
export type ObjectId = z.infer<typeof ObjectIdSchema>;
export type OpeningId = z.infer<typeof OpeningIdSchema>;
/** Stable catalog key such as `desk.gaming.160`; never reused. Unknown ids are kept (I6). */
export type CatalogId = string;

/** Injectable id source: nanoid in the app, a sequence in tests (`createSeqIdGen`). */
export type IdGen = () => string;

export function createNanoIdGen(): IdGen {
  return () => nanoid(ID_LENGTH);
}
