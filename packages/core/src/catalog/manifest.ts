import { z } from 'zod';
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

const text = z.string().trim().min(1).max(LIMITS.maxNameLength);
const I18nTextSchema = z.object({ en: text, es: text });
const metres = z.number().positive().max(LIMITS.maxScale);
const SurfaceSchema = z.enum(['floor', 'wall', 'ceiling', 'tabletop']);

export const CatalogSlotSchema = z.object({
  id: z.string().max(LIMITS.maxKeyLength).regex(SLOT_ID),
  label: I18nTextSchema,
  default: MaterialRefSchema,
  /** The part that glows: a luminaire's light source, drawn emissive (ADR-0006). */
  emissive: z.literal(true).exactOptional(),
});

export const CatalogLicenseSchema = z.object({
  /** An SPDX id, or `LicenseRef-…` for terms SPDX does not list (our own models). */
  spdx: z.string().regex(/^(LicenseRef-)?[A-Za-z0-9.+-]+$/),
  author: text,
  /** Where the asset was made or found, in words. */
  origin: z.string().trim().min(1).max(200),
  /** Page the asset was downloaded from: required for third-party assets. */
  sourceUrl: z.url({ protocol: /^https$/ }).exactOptional(),
  /** The line the attributions page shows for this asset. */
  attribution: z.string().trim().min(1).max(300),
});

export const CatalogManifestItemSchema = z.object({
  id: z.string().max(LIMITS.maxKeyLength).regex(CATALOG_ID),
  name: I18nTextSchema,
  category: z.enum(CATALOG_CATEGORIES),
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(16),
  /** Real bounding box in metres: placement, footprints and placeholders use it. */
  size: z.object({ w: metres, h: metres, d: metres }),
  placement: z.object({ surfaces: z.tuple([SurfaceSchema], SurfaceSchema) }),
  slots: z.array(CatalogSlotSchema).max(LIMITS.maxMaterialSlots),
  light: z
    .object({
      kind: z.enum(['strip', 'bar', 'panel', 'point', 'spot', 'neon']),
      cost: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      defaultColor: HexColorSchema,
    })
    .exactOptional(),
  source: z.object({
    kind: z.literal('glb'),
    file: z.string().regex(MODEL_FILE),
    triangles: z.int().nonnegative(),
    bytes: z.int().positive(),
  }),
  license: CatalogLicenseSchema,
});

export const CatalogManifestSchema = z.object({
  version: z.literal(1),
  items: z.array(CatalogManifestItemSchema).max(1000),
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
