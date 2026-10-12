import { LIGHTING_LOOKS, sunDirection } from '@roomforge/core';
import { type Light, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applyLook, createGlobalLightRig, frameSun, SUN_SHADOW_SIZE } from './global-lights';
import { createShadowRefresh } from './shadow-refresh';

describe('createGlobalLightRig', () => {
  it('is always a hemisphere light and a shadow-casting sun, sized by quality', () => {
    for (const quality of ['low', 'medium', 'high'] as const) {
      const { group, sun } = createGlobalLightRig(quality);
      const lights = group.children.filter((child) => (child as Light).isLight);
      expect(lights).toHaveLength(2);
      expect(sun.castShadow).toBe(true);
      expect(sun.shadow.mapSize.x).toBe(SUN_SHADOW_SIZE[quality]);
    }
    expect(SUN_SHADOW_SIZE).toEqual({ low: 1024, medium: 2048, high: 2048 });
  });
});

describe('applyLook', () => {
  it('writes the look into the lights, the environment strength and the window glass', () => {
    const rig = createGlobalLightRig('medium');
    const scene = { environmentIntensity: 1 };
    const glass = new MeshStandardMaterial();
    const day = LIGHTING_LOOKS.day;
    applyLook({ rig, scene, glass }, { ...day });
    expect(rig.sun.intensity).toBe(day.sun);
    expect(rig.hemisphere.intensity).toBe(day.hemisphere);
    expect(scene.environmentIntensity).toBe(day.environment);
    expect(glass.emissiveIntensity).toBe(day.windowGlow);
    expect(glass.opacity).toBe(day.windowOpacity);
    expect(rig.sun.color.getHexString()).toBe(
      `${day.sunColor
        .map((c) =>
          Math.round(c * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`,
    );
    // Values only: the sun stays visible and keeps its shadow.
    expect(rig.sun.visible).toBe(true);
    expect(rig.sun.castShadow).toBe(true);
  });
});

describe('frameSun', () => {
  it('puts the sun on the side of the azimuth and its shadow camera around the room', () => {
    const { sun } = createGlobalLightRig('medium');
    frameSun(sun, { min: [0, 0, 0], max: [4, 2.5, 4.5] }, 135);
    const towardSun = new Vector3().subVectors(sun.position, sun.target.position).normalize();
    const expected = sunDirection(135);
    expect(towardSun.x).toBeCloseTo(expected[0], 6);
    expect(towardSun.y).toBeCloseTo(expected[1], 6);
    expect(towardSun.z).toBeCloseTo(expected[2], 6);
    const camera = sun.shadow.camera;
    expect(camera.right - camera.left).toBeGreaterThan(4);
    expect(camera.far).toBeGreaterThan(camera.near);
  });
});

describe('createShadowRefresh', () => {
  it('raises the flag, and counts the frames that draw the map', () => {
    const shadowMap = { needsUpdate: false };
    const refresh = createShadowRefresh(shadowMap);
    refresh.request();
    refresh.request(); // twice before a frame: one redraw
    expect(shadowMap.needsUpdate).toBe(true);
    refresh.beforeRender();
    expect(refresh.count()).toBe(1);
    shadowMap.needsUpdate = false; // three.js drew the map
    refresh.beforeRender(); // a camera frame: nothing to redraw
    expect(refresh.count()).toBe(1);
  });
});
