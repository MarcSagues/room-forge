import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LIMITS, type PlacedObject, SceneDocumentSchema } from '../domain';
import { footprintExtents } from '../geometry';
import { LIGHT_POOL_SIZES, poolLightType } from '../lighting';
import type { CatalogItem, CatalogProvider } from '../ports';
import { createFixtureCatalog } from '../testing';
import { checkInvariants } from './invariants';
import {
  createTemplateDocument,
  isTemplateId,
  STARTER_TEMPLATES,
  TEMPLATE_IDS,
  type TemplateId,
} from './templates';

/** The items the templates use, with the sizes and light kinds of the web manifest. */
const ITEMS: readonly CatalogItem[] = [
  floor('desk.office.140', 1.4, 0.74, 0.7),
  floor('desk.gaming.160', 1.6, 0.75, 0.75),
  floor('desk.studio.160', 1.6, 0.75, 0.75),
  floor('chair.gaming.racing', 0.68, 1.3, 0.7),
  floor('chair.gaming.ergonomic', 0.68, 1.3, 0.7),
  floor('chair.gaming.padded', 0.68, 1.3, 0.7),
  floor('monitor.27.flat', 0.61, 0.45, 0.2),
  floor('monitor.ultrawide.34.curved', 0.81, 0.45, 0.25),
  floor('monitor.27.arm', 0.61, 0.45, 0.2),
  lamp('led.strip.1m', 1, 0.016, 0.02, 'strip'),
  lamp('light.bars.pair', 0.38, 0.33, 0.09, 'bar'),
  lamp('panel.hex.cluster', 0.6, 0.4, 0.035, 'panel'),
  lamp('lamp.floor.cone', 0.42, 1.6, 0.42, 'point'),
  lamp('lamp.desk.arm', 0.18, 0.44, 0.42, 'spot'),
  lamp('neon.sign.wave', 0.6, 0.32, 0.04, 'neon'),
];

function floor(id: string, w: number, h: number, d: number): CatalogItem {
  return { id, size: { w, h, d }, placement: { surfaces: ['floor'] } };
}

function lamp(id: string, w: number, h: number, d: number, kind: string): CatalogItem {
  return {
    ...floor(id, w, h, d),
    light: { kind: kind as never, cost: 1, defaultColor: '#ffffff' },
  };
}

const catalog: CatalogProvider = createFixtureCatalog(ITEMS);
const furnished = TEMPLATE_IDS.filter((id) => id !== 'empty');

const objectsOf = (id: TemplateId) => {
  const document = createTemplateDocument(id, catalog);
  return document.objectOrder.map((objectId) => document.objects[objectId] as PlacedObject);
};

/** Gap between an object's footprint and the nearest wall of its room, in metres. */
function gapToWall(object: PlacedObject, width: number, depth: number): number {
  const item = catalog.getItem(object.catalogId) as CatalogItem;
  const [ex, ez] = footprintExtents(item.size.w, item.size.d, object.transform.rotationY, [0, 0]);
  const [x, , z] = object.transform.position;
  return Math.min(x - ex, z - ez, width - (x + ex), depth - (z + ez));
}

describe('STARTER_TEMPLATES', () => {
  it('offers an empty room and three furnished setups, in a stable order', () => {
    expect(TEMPLATE_IDS).toEqual(['empty', 'gaming', 'office', 'streaming']);
    expect(STARTER_TEMPLATES.map((template) => template.id)).toEqual([...TEMPLATE_IDS]);
  });

  it('tells template ids from anything else', () => {
    for (const id of TEMPLATE_IDS) expect(isTemplateId(id)).toBe(true);
    for (const value of ['', 'Gaming', 'toString', '__proto__', 1, null, undefined]) {
      expect(isTemplateId(value)).toBe(false);
    }
  });

  it('only uses items of the catalog the tests mirror', () => {
    const known = new Set(ITEMS.map((item) => item.id));
    for (const template of STARTER_TEMPLATES) {
      for (const object of template.objects) expect(known.has(object.catalogId)).toBe(true);
    }
  });
});

describe('createTemplateDocument', () => {
  it.each(TEMPLATE_IDS)('builds "%s" as a valid document that satisfies the invariants', (id) => {
    const document = createTemplateDocument(id, catalog);
    expect(SceneDocumentSchema.safeParse(document).success).toBe(true);
    expect(checkInvariants(document, catalog)).toEqual([]);
    expect(document.roomOrder).toHaveLength(1);
  });

  it('keeps "empty" a bare room of the default size', () => {
    const document = createTemplateDocument('empty', catalog);
    expect(document.objectOrder).toEqual([]);
    expect(document.openings).toEqual({});
    expect(Object.values(document.rooms)[0]?.shape).toEqual({ kind: 'rect', width: 4, depth: 4.5 });
  });

  it.each(furnished)('furnishes "%s" with a desk, a chair, a screen and lights', (id) => {
    const ids = objectsOf(id).map((object) => object.catalogId);
    expect(ids.some((catalogId) => catalogId.startsWith('desk.'))).toBe(true);
    expect(ids.some((catalogId) => catalogId.startsWith('chair.'))).toBe(true);
    expect(ids.some((catalogId) => catalogId.startsWith('monitor.'))).toBe(true);
    expect(objectsOf(id).filter((object) => object.light).length).toBeGreaterThanOrEqual(2);
  });

  it.each(furnished)('keeps "%s" inside the scene budget', (id) => {
    const objects = objectsOf(id);
    expect(objects.length).toBeLessThanOrEqual(15);
    const kinds = objects.flatMap((object) => {
      const light = catalog.getItem(object.catalogId)?.light;
      return light ? [poolLightType(light.kind)] : [];
    });
    // Every lamp gets a real light even at the lowest quality.
    expect(kinds.filter((kind) => kind === 'point').length).toBeLessThanOrEqual(
      LIGHT_POOL_SIZES.low.point,
    );
    expect(kinds.filter((kind) => kind === 'spot').length).toBeLessThanOrEqual(
      LIGHT_POOL_SIZES.medium.spot,
    );
  });

  it.each(furnished)('gives every luminaire of "%s" its own light state', (id) => {
    for (const object of objectsOf(id)) {
      const isLamp = catalog.getItem(object.catalogId)?.light !== undefined;
      expect(object.light !== undefined, object.catalogId).toBe(isLamp);
    }
  });

  it.each(furnished)('puts the desk and the wall lights of "%s" against a wall', (id) => {
    const document = createTemplateDocument(id, catalog);
    const room = Object.values(document.rooms)[0];
    if (room?.shape.kind !== 'rect') throw new Error('rect room expected');
    const { width, depth } = room.shape;
    const template = STARTER_TEMPLATES.find((entry) => entry.id === id);
    const objects = objectsOf(id);
    template?.objects.forEach((spec, index) => {
      const object = objects[index] as PlacedObject;
      if (spec.againstWall) expect(gapToWall(object, width, depth), spec.catalogId).toBeCloseTo(0);
    });
    expect(
      template?.objects.some((spec) => spec.againstWall && spec.catalogId.startsWith('desk.')),
    ).toBe(true);
  });

  it('starts setups that glow at night and the office by day', () => {
    expect(createTemplateDocument('gaming', catalog).lighting.mode).toBe('night');
    expect(createTemplateDocument('streaming', catalog).lighting.mode).toBe('night');
    expect(createTemplateDocument('office', catalog).lighting.mode).toBe('day');
  });

  it('gives every call an independent copy with its own ids', () => {
    const a = createTemplateDocument('gaming', catalog);
    const b = createTemplateDocument('gaming', catalog);
    expect(a.objectOrder.some((id) => b.objectOrder.includes(id))).toBe(false);
    expect(a.roomOrder[0]).not.toBe(b.roomOrder[0]);
    a.objectOrder.pop();
    expect(b.objectOrder).toHaveLength(objectsOf('gaming').length);
  });

  it('still builds when the catalog knows none of the items (I6)', () => {
    const unknown: CatalogProvider = { getItem: () => undefined };
    for (const id of TEMPLATE_IDS) {
      const document = createTemplateDocument(id, unknown);
      expect(checkInvariants(document, unknown)).toEqual([]);
    }
  });

  it('builds every template, whatever the room is called', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TEMPLATE_IDS),
        fc
          .string({ minLength: 1, maxLength: LIMITS.maxNameLength })
          .filter((name) => name.trim() !== ''),
        (id, roomName) => {
          const document = createTemplateDocument(id, catalog, { roomName });
          expect(checkInvariants(document, catalog)).toEqual([]);
          expect(Object.values(document.rooms)[0]?.name).toBe(roomName);
        },
      ),
      { numRuns: 40 },
    );
  });
});
