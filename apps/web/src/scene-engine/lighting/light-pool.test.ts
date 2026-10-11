import {
  createEditorSession,
  type HexColor,
  LIGHT_POOL_SIZES,
  type Luminaire,
  type ObjectId,
  setAllLights,
  setLight,
} from '@roomforge/core';
import {
  buildDocument,
  buildObject,
  createFixtureCatalog,
  FIXTURE_CATALOG_ITEMS,
} from '@roomforge/core/testing';
import { PerspectiveCamera, type PointLight, type SpotLight } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAllocation, createLightPool, type LightPool, POINT_INTENSITY } from './light-pool';
import { createLightPoolDriver } from './light-pool-driver';

const lights = (pool: LightPool): (PointLight | SpotLight)[] => [...pool.points, ...pool.spots];

describe('createLightPool', () => {
  it.each(Object.entries(LIGHT_POOL_SIZES))(
    'makes the %s pool once: every light dark, shown and without shadows',
    (_, size) => {
      const pool = createLightPool(size);
      expect(pool.points).toHaveLength(size.point);
      expect(pool.spots).toHaveLength(size.spot);
      for (const light of lights(pool)) {
        expect(light.intensity).toBe(0);
        expect(light.visible).toBe(true);
        expect(light.castShadow).toBe(false);
        expect(light.parent).toBe(pool.group);
      }
    },
  );
});

describe('applyAllocation', () => {
  const lamp = (id: string, overrides: Partial<Luminaire> = {}): Luminaire => ({
    id: id as ObjectId,
    type: 'point',
    cost: 1,
    on: true,
    color: '#ff0000' as HexColor,
    intensity: 0.5,
    position: [1, 2, 3],
    head: [1, 2.5, 3],
    yaw: 0,
    selected: false,
    ...overrides,
  });

  it('lights the chosen luminaires in place and darkens the rest, never hiding a light', () => {
    const pool = createLightPool({ point: 2, spot: 1 });
    const a = lamp('a');
    const desk = lamp('desk', { type: 'spot', color: '#00ff00' as HexColor, intensity: 1 });
    const byId = new Map([a, desk].map((item) => [item.id, item]));
    applyAllocation(pool, { point: [null, a.id], spot: [desk.id] }, byId);
    const [first, second] = pool.points;
    const [spot] = pool.spots;
    expect(first?.intensity).toBe(0);
    expect(second?.intensity).toBeCloseTo(POINT_INTENSITY * 0.5);
    expect(second?.color.getHex()).toBe(0xff0000);
    expect(second?.position.toArray()).toEqual([1, 2, 3]);
    expect(spot?.color.getHex()).toBe(0x00ff00);
    expect(spot?.position.toArray()).toEqual([1, 2.5, 3]);
    // Shining down and forward (+z at yaw 0).
    expect(spot?.target.position.y).toBeLessThan(2.5);
    expect(spot?.target.position.z).toBeGreaterThan(3);

    applyAllocation(pool, { point: [null, null], spot: [null] }, byId);
    expect(lights(pool).map((light) => light.intensity)).toEqual([0, 0, 0]);
    expect(lights(pool).every((light) => light.visible)).toBe(true);
    expect(pool.group.children).toHaveLength(4); // two points, a spot and its target
  });
});

describe('createLightPoolDriver', () => {
  afterEach(() => vi.useRealTimers());

  const LAMP = {
    id: 'lamp.desk',
    size: { w: 0.2, h: 0.4, d: 0.4 },
    placement: { surfaces: ['floor'] },
    light: { kind: 'spot', cost: 1, defaultColor: '#fff2d6' },
  } as const;

  function setup() {
    const doc = buildDocument();
    const add = (id: string, catalogId: string, x: number) => {
      const object = buildObject({
        id,
        catalogId,
        transform: { position: [x, 0, 1], rotationY: 0 },
      });
      doc.objects[object.id] = object;
      doc.objectOrder.push(object.id);
    };
    for (let i = 0; i < 3; i += 1) add(`strip-${i}`, 'led.strip.1m', 0.5 + i);
    add('lamp-1', LAMP.id, 3.5);
    const catalog = createFixtureCatalog([...FIXTURE_CATALOG_ITEMS, LAMP]);
    const session = createEditorSession({ initialDocument: doc, catalog });
    const size = { point: 2, spot: 1 };
    const pool = createLightPool(size);
    const invalidate = vi.fn();
    const driver = createLightPoolDriver({ session, catalog, pool, size, invalidate });
    const camera = new PerspectiveCamera();
    camera.position.set(0.5, 1.6, 4);
    camera.lookAt(0.5, 0.5, 0);
    return { session, pool, invalidate, driver, camera };
  }

  it('deals the lights out once it has a camera, and again when the document changes', () => {
    const { session, pool, invalidate, driver, camera } = setup();
    expect(driver.info().lit).toEqual([]); // no camera yet
    driver.watch(camera);
    expect(driver.info()).toEqual({ points: 2, spots: 1, lit: ['strip-0', 'strip-1', 'lamp-1'] });
    expect(invalidate).not.toHaveBeenCalled(); // that frame is being drawn already

    session.execute(setLight(['strip-0' as ObjectId], { on: false }));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(driver.allocation().point).toEqual(['strip-2', 'strip-1']);
    session.execute(setLight(['strip-1' as ObjectId], { color: '#0000ff' }));
    expect(pool.points[1]?.color.getHex()).toBe(0x0000ff);

    session.execute(setAllLights({ on: false }));
    expect(driver.info().lit).toEqual([]);
    expect(lights(pool).map((light) => light.intensity)).toEqual([0, 0, 0]);
    expect(pool.group.children).toHaveLength(4);
    driver.dispose();
  });

  it('waits for the camera to move enough, then reallocates once it settles', () => {
    vi.useFakeTimers();
    const { invalidate, driver, camera } = setup();
    driver.watch(camera);
    invalidate.mockClear();
    camera.position.x += 0.1; // a small nudge: nothing to do
    driver.watch(camera);
    vi.runAllTimers();
    expect(invalidate).not.toHaveBeenCalled();
    camera.position.z += 1; // further back: the same luminaires keep their lights, no frame
    driver.watch(camera);
    vi.runAllTimers();
    expect(invalidate).not.toHaveBeenCalled();

    camera.position.set(3.5, 1.6, 4); // over to the other side of the room
    camera.lookAt(3.5, 0.5, 0);
    driver.watch(camera);
    driver.watch(camera);
    expect(invalidate).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(driver.allocation().point).toContain('strip-2');
    driver.dispose();
  });

  it('stops following the session once disposed', () => {
    const { session, invalidate, driver, camera } = setup();
    driver.watch(camera);
    driver.dispose();
    invalidate.mockClear();
    session.execute(setAllLights({ on: false }));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
