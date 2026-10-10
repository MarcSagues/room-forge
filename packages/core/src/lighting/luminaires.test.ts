import { describe, expect, it } from 'vitest';
import type { SceneDocument } from '../domain';
import type { CatalogItem } from '../ports';
import {
  buildDocument,
  buildObject,
  buildRoom,
  createFixtureCatalog,
  FIXTURE_CATALOG_ITEMS,
} from '../testing';
import { collectLuminaires, lightStateOf, poolLightType } from './luminaires';

const DESK_LAMP: CatalogItem = {
  id: 'lamp.desk',
  size: { w: 0.2, h: 0.4, d: 0.4 },
  placement: { surfaces: ['tabletop'] },
  light: { kind: 'spot', cost: 1, defaultColor: '#fff2d6' },
};
const catalog = createFixtureCatalog([...FIXTURE_CATALOG_ITEMS, DESK_LAMP]);

/** The fixture scene (a desk with a monitor) with a strip and a desk lamp added. */
function scene(edit: (doc: SceneDocument) => void = () => {}): SceneDocument {
  const doc = buildDocument();
  const strip = buildObject({
    id: 'strip-1',
    catalogId: 'led.strip.1m',
    transform: { position: [1, 2, 0.5], rotationY: 0 },
  });
  // On the desk (top at 0.75), 0.3 m right of its centre, turned a quarter towards +x.
  const lamp = buildObject({
    id: 'lamp-1',
    catalogId: 'lamp.desk',
    parentId: 'desk-1',
    transform: { position: [0.3, 0.75, 0], rotationY: Math.PI / 2 },
  });
  doc.objects[strip.id] = strip;
  doc.objects[lamp.id] = lamp;
  doc.objectOrder.push(strip.id, lamp.id);
  edit(doc);
  return doc;
}

describe('poolLightType', () => {
  it('gives spot lamps a spot and every other kind a point', () => {
    expect(poolLightType('spot')).toBe('spot');
    for (const kind of ['strip', 'bar', 'panel', 'point', 'neon'] as const) {
      expect(poolLightType(kind)).toBe('point');
    }
  });
});

describe('lightStateOf', () => {
  it("is the object's own state, or the item's defaults when it has none", () => {
    expect(lightStateOf({}, DESK_LAMP)).toEqual({
      on: true,
      color: '#fff2d6',
      intensity: 1,
      effect: { kind: 'static' },
    });
    const own = {
      on: false,
      color: '#ff0000' as const,
      intensity: 0.3,
      effect: { kind: 'static' as const },
    };
    expect(lightStateOf({ light: own }, DESK_LAMP)).toEqual(own);
    expect(lightStateOf({}, undefined).color).toBe('#ffffff');
  });
});

describe('collectLuminaires', () => {
  it('finds the objects that give light, with their world pose and light state', () => {
    const [strip, lamp, ...rest] = collectLuminaires(scene(), catalog, ['lamp-1']);
    expect(rest).toEqual([]);
    expect(strip).toMatchObject({
      id: 'strip-1',
      type: 'point',
      cost: 1,
      on: true,
      color: '#ffffff',
      intensity: 1,
      selected: false,
      yaw: 0,
    });
    expect(strip?.position[0]).toBeCloseTo(1);
    expect(strip?.position[1]).toBeCloseTo(2.005);
    expect(strip?.position[2]).toBeCloseTo(0.5);
    // The desk stands at (2, 0, 1.5): the lamp's base is at (2.3, 0.75, 1.5).
    expect(lamp).toMatchObject({ id: 'lamp-1', type: 'spot', color: '#fff2d6', selected: true });
    expect(lamp?.yaw).toBeCloseTo(Math.PI / 2);
    expect(lamp?.position.map((value) => Number(value.toFixed(6)))).toEqual([2.3, 0.95, 1.5]);
    expect(lamp?.head.map((value) => Number(value.toFixed(6)))).toEqual([2.3, 1.15, 1.5]);
  });

  it('follows the room origin, the parent turn and scale', () => {
    const doc = scene((draft) => {
      draft.rooms['room-1' as never] = buildRoom({ origin: [10, -4] });
      const desk = draft.objects['desk-1' as never];
      if (desk)
        desk.transform = { position: [2, 0, 1.5], rotationY: Math.PI / 2, scale: [2, 1, 1] };
    });
    const lamp = collectLuminaires(doc, catalog).find((item) => item.id === 'lamp-1');
    // Local x 0.3 is scaled to 0.6, then turned a quarter: it points along -z.
    expect(lamp?.position.map((value) => Number(value.toFixed(6)))).toEqual([12, 0.95, -3.1]);
    expect(lamp?.yaw).toBeCloseTo(Math.PI);
  });

  it('reads the light state the commands wrote', () => {
    const doc = scene((draft) => {
      const strip = draft.objects['strip-1' as never];
      if (strip) {
        strip.light = { on: false, color: '#00ff00', intensity: 0.4, effect: { kind: 'static' } };
      }
    });
    expect(collectLuminaires(doc, catalog)[0]).toMatchObject({
      on: false,
      color: '#00ff00',
      intensity: 0.4,
    });
  });

  it('leaves out hidden luminaires, those on a hidden parent, and unknown items', () => {
    const hiddenDesk = scene((draft) => {
      const desk = draft.objects['desk-1' as never];
      if (desk) desk.hidden = true;
    });
    expect(collectLuminaires(hiddenDesk, catalog).map((item) => item.id)).toEqual(['strip-1']);
    const hiddenStrip = scene((draft) => {
      const strip = draft.objects['strip-1' as never];
      if (strip) strip.hidden = true;
    });
    expect(collectLuminaires(hiddenStrip, catalog).map((item) => item.id)).toEqual(['lamp-1']);
    expect(collectLuminaires(scene(), createFixtureCatalog())).toHaveLength(1);
  });
});
