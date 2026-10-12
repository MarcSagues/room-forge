import { DAY_NIGHT_TRANSITION_MS, LIGHTING_LOOKS } from '@roomforge/core';
import { MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { DayNightDriver } from './day-night-driver';
import { createGlobalLightRig } from './global-lights';

function setup(mode: 'day' | 'night' = 'day', duration = DAY_NIGHT_TRANSITION_MS) {
  const rig = createGlobalLightRig('medium');
  const scene = { environmentIntensity: 1 };
  const glass = new MeshStandardMaterial();
  const driver = new DayNightDriver({ rig, scene, glass }, duration, mode);
  return { rig, scene, glass, driver };
}

describe('DayNightDriver', () => {
  it('opens in the document mode without a transition', () => {
    const { rig, scene, driver } = setup('night');
    expect(driver.level).toBe(1);
    expect(rig.sun.intensity).toBeCloseTo(LIGHTING_LOOKS.night.sun, 9);
    expect(scene.environmentIntensity).toBeCloseTo(LIGHTING_LOOKS.night.environment, 9);
    expect(driver.step('night', 16)).toBe(false);
  });

  it('eases from day to night in about 700 ms, changing values only', () => {
    const { rig, scene, glass, driver } = setup();
    const sunBefore = rig.sun.intensity;
    let frames = 0;
    while (driver.step('night', 16)) frames += 1;
    expect(frames + 1).toBe(Math.ceil(DAY_NIGHT_TRANSITION_MS / 16));
    expect(driver.level).toBe(1);
    expect(rig.sun.intensity).toBeLessThan(sunBefore);
    expect(rig.sun.visible).toBe(true);
    expect(rig.sun.castShadow).toBe(true);
    expect(rig.hemisphere.intensity).toBeCloseTo(LIGHTING_LOOKS.night.hemisphere, 9);
    expect(scene.environmentIntensity).toBeCloseTo(LIGHTING_LOOKS.night.environment, 9);
    expect(glass.emissiveIntensity).toBeCloseTo(LIGHTING_LOOKS.night.windowGlow, 9);
    // Night light is bluish.
    expect(rig.hemisphere.color.b).toBeGreaterThan(rig.hemisphere.color.r);
  });

  it('turns back halfway through a transition', () => {
    const { driver } = setup();
    driver.step('night', DAY_NIGHT_TRANSITION_MS / 2);
    expect(driver.level).toBeCloseTo(0.5, 9);
    expect(driver.step('day', DAY_NIGHT_TRANSITION_MS / 4)).toBe(true);
    expect(driver.level).toBeCloseTo(0.25, 9);
  });

  it('jumps at once with reduced motion (no duration)', () => {
    const { driver } = setup('day', 0);
    expect(driver.step('night', 16)).toBe(false);
    expect(driver.level).toBe(1);
  });
});
