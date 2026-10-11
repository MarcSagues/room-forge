import { z } from 'zod/mini';
import { HexColorSchema, LIMITS, MaterialRefSchema } from '../domain';
import type { CatalogItem } from '../ports';

/** DOMAIN_MODEL §3.1. */
export const CATALOG_CATEGORIES = [
  'desk',
  'seating',
  'storage',
  'computing',
  'audio',
  'entertainment',
  'lighting',
  'decor',
] as const;
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

/** `family.style[.size…]`, lowercase: stable and never reused once published. */
const CATALOG_ID = /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;
const SLOT_ID = /^[a-z][a-z0-9-]*$/;
/** Relative to the public assets folder; no way out of it. */
const MODEL_FILE = /^models\/[a-z0-9][a-z0-9.-]*\.glb$/;
const THUMBNAIL_FILE = /^thumbnails\/[a-z0-9][a-z0-9.-]*\.webp$/;

/** Trimmed, then 1 to `max` characters (`z.string().trim().min(1).max()` in classic zod). */
const trimmed = (max: number) => z.string().check(z.trim(), z.minLength(1), z.maxLength(max));
const text = trimmed(LIMITS.maxNameLength);
const I18nTextSchema = z.object({ en: text, es: text });
const metres = z.number().check(z.positive(), z.lte(LIMITS.maxScale));
const SurfaceSchema = z.enum(['floor', 'wall', 'ceiling', 'tabletop']);

export const CatalogSlotSchema = z.object({
  id: z.string().check(z.maxLength(LIMITS.maxKeyLength), z.regex(SLOT_ID)),
  label: I18nTextSchema,
  default: MaterialRefSchema,
  /** The part that glows: a luminaire's light source, drawn emissive (ADR-0006). */
  emissive: z.exactOptional(z.literal(true)),
});

export const CatalogLicenseSchema = z.object({
  /** An SPDX id, or `LicenseRef-…` for terms SPDX does not list (our own models). */
  spdx: z.string().check(z.regex(/^(LicenseRef-)?[A-Za-z0-9.+-]+$/)),
  author: text,
  /** Where the asset was made or found, in words. */
  origin: trimmed(200),
  /** Page the asset was downloaded from: required for third-party assets. */
  sourceUrl: z.exactOptional(z.url({ protocol: /^https$/ })),
  /** The line the attributions page shows for this asset. */
  attribution: trimmed(300),
});

export const CatalogManifestItemSchema = z.object({
  id: z.string().check(z.maxLength(LIMITS.maxKeyLength), z.regex(CATALOG_ID)),
  name: I18nTextSchema,
  category: z.enum(CATALOG_CATEGORIES),
  tags: z.array(z.string().check(z.regex(/^[a-z0-9-]+$/))).check(z.maxLength(16)),
  /** Real bounding box in metres: placement, footprints and placeholders use it. */
  size: z.object({ w: metres, h: metres, d: metres }),
  placement: z.object({ surfaces: z.tuple([SurfaceSchema], SurfaceSchema) }),
  slots: z.array(CatalogSlotSchema).check(z.maxLength(LIMITS.maxMaterialSlots)),
  light: z.exactOptional(
    z.object({
      kind: z.enum(['strip', 'bar', 'panel', 'point', 'spot', 'neon']),
      cost: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      defaultColor: HexColorSchema,
    }),
  ),
  source: z.object({
    kind: z.literal('glb'),
    file: z.string().check(z.regex(MODEL_FILE)),
    triangles: z.int().check(z.nonnegative()),
    bytes: z.int().check(z.positive()),
  }),
  /** Picture of the model for the catalog panel (P4-03), relative to the public assets folder. */
  thumbnail: z.exactOptional(z.string().check(z.regex(THUMBNAIL_FILE))),
  license: CatalogLicenseSchema,
});

export const CatalogManifestSchema = z.object({
  version: z.literal(1),
  items: z.array(CatalogManifestItemSchema).check(z.maxLength(1000)),
});

export type CatalogManifestItem = z.infer<typeof CatalogManifestItemSchema>;
export type CatalogManifest = z.infer<typeof CatalogManifestSchema>;

/** The part of a manifest item that core checks invariants with (the `CatalogProvider` port). */
export function toCatalogItem(item: CatalogManifestItem): CatalogItem {
  return {
    id: item.id,
    size: item.size,
    placement: { surfaces: item.placement.surfaces },
    slots: item.slots.map((slot) => ({
      id: slot.id,
      default: slot.default,
      ...(slot.emissive ? { emissive: true } : {}),
    })),
    ...(item.light ? { light: item.light } : {}),
  };
}
