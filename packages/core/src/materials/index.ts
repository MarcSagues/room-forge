import type { HexColor, MaterialRef } from '../domain';

export const MATERIAL_CATEGORIES = ['paint', 'wood', 'floor', 'panel', 'fabric', 'metal'] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

/** Procedural patterns the renderer can draw: no image files to download. */
export type MaterialPattern = 'wood-grain' | 'planks' | 'concrete' | 'slats' | 'weave' | 'tiles';

/**
 * A material the app offers (DOMAIN_MODEL `MaterialRef.presetId`). Presets are app data like the
 * catalog, not part of the document: a document only stores the id and its overrides, so adding
 * or retuning a preset never changes a saved design's structure.
 */
export interface MaterialPreset {
  /** `category.name`, e.g. `wood.oak`. */
  readonly id: string;
  readonly name: { readonly en: string; readonly es: string };
  readonly category: MaterialCategory;
  /** Base colour; a reference's `tint` is multiplied with it by the renderer. */
  readonly color: HexColor;
  readonly roughness: number;
  readonly metalness: number;
  readonly pattern?: MaterialPattern;
}

/** Drawn when a document names a preset this version does not know (invariant I6). */
export const DEFAULT_MATERIAL_PRESET_ID = 'paint.matte';

const preset = (
  id: string,
  en: string,
  es: string,
  color: HexColor,
  roughness: number,
  metalness = 0,
  pattern?: MaterialPattern,
): MaterialPreset => ({
  id,
  name: { en, es },
  category: id.slice(0, id.indexOf('.')) as MaterialCategory,
  color,
  roughness,
  metalness,
  ...(pattern ? { pattern } : {}),
});

export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  preset('paint.matte', 'Matte white', 'Blanco mate', '#f1efe9', 0.95),
  preset('paint.satin', 'Satin white', 'Blanco satinado', '#f4f2ec', 0.5),
  preset('paint.warm', 'Warm beige', 'Beige cálido', '#e6d5bd', 0.92),
  preset('paint.grey', 'Light grey', 'Gris claro', '#c9ccd0', 0.92),
  preset('paint.sage', 'Sage green', 'Verde salvia', '#a3b59b', 0.92),
  preset('paint.navy', 'Deep navy', 'Azul marino', '#27324a', 0.9),
  preset('paint.charcoal', 'Charcoal', 'Carbón', '#3a3d42', 0.9),
  preset('wood.oak', 'Oak', 'Roble', '#b88a55', 0.65, 0, 'wood-grain'),
  preset('wood.walnut', 'Walnut', 'Nogal', '#6b4a33', 0.6, 0, 'wood-grain'),
  preset('wood.birch', 'Birch', 'Abedul', '#dcc7a1', 0.65, 0, 'wood-grain'),
  preset('wood.pine', 'Pine', 'Pino', '#d1a86a', 0.7, 0, 'wood-grain'),
  preset('wood.black', 'Black oak', 'Roble negro', '#2b2724', 0.6, 0, 'wood-grain'),
  preset('floor.oak', 'Oak floor', 'Suelo de roble', '#a67a48', 0.6, 0, 'planks'),
  preset('floor.grey', 'Grey laminate', 'Laminado gris', '#8d9096', 0.55, 0, 'planks'),
  preset('floor.concrete', 'Concrete', 'Hormigón', '#9a9a98', 0.85, 0, 'concrete'),
  preset('floor.microcement', 'Microcement', 'Microcemento', '#b5b2ab', 0.7, 0, 'concrete'),
  preset('floor.tile', 'Light tile', 'Baldosa clara', '#d9d6cf', 0.35, 0, 'tiles'),
  preset('panel.slats', 'Wood slat panel', 'Panel de listones', '#9c7447', 0.7, 0, 'slats'),
  preset('panel.acoustic', 'Acoustic panel', 'Panel acústico', '#41454d', 0.95, 0, 'weave'),
  preset('panel.white', 'White panel', 'Panel blanco', '#ebebe8', 0.8),
  preset('fabric.grey', 'Grey fabric', 'Tela gris', '#7e828a', 0.95, 0, 'weave'),
  preset('fabric.beige', 'Beige fabric', 'Tela beige', '#cdbfa6', 0.95, 0, 'weave'),
  preset('fabric.black', 'Black fabric', 'Tela negra', '#26282c', 0.95, 0, 'weave'),
  preset('metal.steel', 'Brushed steel', 'Acero cepillado', '#b4b8bd', 0.4, 1),
  preset('metal.black', 'Black metal', 'Metal negro', '#25272b', 0.45, 0.9),
];

const BY_ID = new Map(MATERIAL_PRESETS.map((entry) => [entry.id, entry]));

/** The preset with this id, or undefined (documents may name presets this version does not know). */
export function getMaterialPreset(id: string): MaterialPreset | undefined {
  return BY_ID.get(id);
}

/** A material ready to draw: the reference's overrides applied over its preset. */
export interface ResolvedMaterial {
  /** Exactly what the document says, even when unknown. */
  presetId: string;
  /** False when the preset is not in this version's library and the default is drawn instead. */
  known: boolean;
  /** The preset's base colour. */
  color: HexColor;
  /** Multiplies `color` when set. */
  tint: HexColor | null;
  roughness: number;
  metalness: number;
  pattern: MaterialPattern | null;
}

/**
 * What to draw for a `MaterialRef`: its preset with `tint`, `roughness` and `metalness` applied
 * over it. An unknown preset keeps its id (the document is never edited by being opened) and is
 * drawn with the default material (invariant I6).
 */
export function resolveMaterial(ref: MaterialRef): ResolvedMaterial {
  const found = BY_ID.get(ref.presetId);
  const base = found ?? (BY_ID.get(DEFAULT_MATERIAL_PRESET_ID) as MaterialPreset);
  return {
    presetId: ref.presetId,
    known: found !== undefined,
    color: base.color,
    tint: ref.tint ?? null,
    roughness: ref.roughness ?? base.roughness,
    metalness: ref.metalness ?? base.metalness,
    pattern: base.pattern ?? null,
  };
}
