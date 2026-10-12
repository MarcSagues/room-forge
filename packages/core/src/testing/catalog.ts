import type { CatalogItem, CatalogProvider } from '../ports';

/** Five catalog items covering every placement case, so core tests need no real assets. */
export const FIXTURE_CATALOG_ITEMS: readonly CatalogItem[] = [
  {
    id: 'desk.basic.120',
    size: { w: 1.2, h: 0.75, d: 0.6 },
    placement: { surfaces: ['floor'] },
    supports: [{ y: 0.75, rect: { x: 0, z: 0, w: 1.2, d: 0.6 } }],
    slots: [
      { id: 'top', default: { presetId: 'wood.oak' } },
      { id: 'frame', default: { presetId: 'metal.black' } },
    ],
  },
  {
    id: 'chair.office',
    size: { w: 0.6, h: 1.1, d: 0.6 },
    placement: { surfaces: ['floor'] },
    slots: [{ id: 'seat', default: { presetId: 'fabric.grey' } }],
  },
  { id: 'monitor.27', size: { w: 0.62, h: 0.45, d: 0.2 }, placement: { surfaces: ['tabletop'] } },
  { id: 'shelf.wall', size: { w: 0.8, h: 0.2, d: 0.25 }, placement: { surfaces: ['wall'] } },
  {
    id: 'led.strip.1m',
    size: { w: 1, h: 0.01, d: 0.01 },
    placement: { surfaces: ['wall', 'tabletop', 'floor'] },
    light: { kind: 'strip', cost: 1, defaultColor: '#ffffff' },
  },
];

export function createFixtureCatalog(items = FIXTURE_CATALOG_ITEMS): CatalogProvider {
  const byId = new Map(items.map((item) => [item.id, item]));
  return { getItem: (id) => byId.get(id) };
}
