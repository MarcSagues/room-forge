import type { CatalogId, CatalogItem, CatalogProvider } from '@roomforge/core';

/** What the catalog panel shows about an item: the full manifest entry arrives with P4-02. */
export interface CatalogEntry {
  readonly id: CatalogId;
  /** Generic names, no brands (AGENTS rule 11). */
  readonly name: { readonly en: string; readonly es: string };
  /** Bounding box in metres. */
  readonly size: { readonly w: number; readonly h: number; readonly d: number };
  /** Colour of the placeholder box that stands in for the model. */
  readonly color: string;
}

/** The five items of the stub manifest: coloured boxes, all standing on the floor. */
const ENTRIES: readonly CatalogEntry[] = [
  {
    id: 'desk.basic.140',
    name: { en: 'Desk', es: 'Escritorio' },
    size: { w: 1.4, h: 0.75, d: 0.7 },
    color: '#8b6f9e',
  },
  {
    id: 'chair.office',
    name: { en: 'Office chair', es: 'Silla de oficina' },
    size: { w: 0.6, h: 1.0, d: 0.6 },
    color: '#4a5568',
  },
  {
    id: 'bed.single',
    name: { en: 'Single bed', es: 'Cama individual' },
    size: { w: 0.9, h: 0.5, d: 2.0 },
    color: '#8fb8de',
  },
  {
    id: 'shelf.tall',
    name: { en: 'Bookshelf', es: 'Estantería' },
    size: { w: 0.8, h: 1.8, d: 0.3 },
    color: '#d9b45b',
  },
  {
    id: 'plant.floor',
    name: { en: 'Floor plant', es: 'Planta de suelo' },
    size: { w: 0.4, h: 0.9, d: 0.4 },
    color: '#5a9a5a',
  },
];

const byId = new Map(ENTRIES.map((entry) => [entry.id, entry]));

/** The core port plus the colour of each placeholder box (the scene reads it, core does not). */
export interface ColoredCatalog extends CatalogProvider {
  colorOf(id: CatalogId): string | undefined;
}

export const stubCatalog: ColoredCatalog = {
  getItem(id): CatalogItem | undefined {
    const entry = byId.get(id);
    return entry && { id: entry.id, size: entry.size, placement: { surfaces: ['floor'] } };
  },
  colorOf: (id) => byId.get(id)?.color,
};

/** The stub items, in the order the panel lists them (after the real ones). */
export function stubEntries(): readonly CatalogEntry[] {
  return ENTRIES;
}
