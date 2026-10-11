import {
  type Bounds3,
  type LightingLook,
  type LightQuality,
  type Rgb01,
  sunDirection,
  sunShadowFrame,
} from '@roomforge/core';
import {
  type Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  type MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';

/** Shadow map size per quality (P2-11): the sun is the only shadow, and it is static. */
export const SUN_SHADOW_SIZE: Readonly<Record<LightQuality, number>> = {
  low: 1024,
  medium: 2048,
  high: 2048,
};

export const GLOBAL_LIGHTS_NAME = 'global-lights';

/** The scene's global lights: always these two, by day and by night (fixed light count). */
export interface GlobalLightRig {
  readonly group: Group;
  readonly hemisphere: HemisphereLight;
  /** The sun by day, the moon by night: the only shadow caster, set up once (ADR-0006). */
  readonly sun: DirectionalLight;
}

export function createGlobalLightRig(quality: LightQuality): GlobalLightRig {
  const group = new Group();
  group.name = GLOBAL_LIGHTS_NAME;
  const hemisphere = new HemisphereLight();
  const sun = new DirectionalLight();
  // Decided here, once: toggling `castShadow` later would recompile every material.
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(SUN_SHADOW_SIZE[quality]);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  group.add(hemisphere, sun, sun.target);
  return { group, hemisphere, sun };
}

/** Points the sun at the rooms from `azimuth` and fits its shadow camera around them. */
export function frameSun(sun: DirectionalLight, bounds: Bounds3, azimuth: number): void {
  const frame = sunShadowFrame(bounds, sunDirection(azimuth));
  sun.position.set(...frame.position);
  sun.target.position.set(...frame.target);
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  const camera = sun.shadow.camera;
  camera.left = frame.left;
  camera.right = frame.right;
  camera.top = frame.top;
  camera.bottom = frame.bottom;
  camera.near = frame.near;
  camera.far = frame.far;
  camera.updateProjectionMatrix();
}

/** What a lighting look is written into. */
export interface LookTargets {
  rig: GlobalLightRig;
  /** The scene: only its `environmentIntensity` changes (the environment itself never does). */
  scene: { environmentIntensity: number };
  /** The shared window glass, which shows the colour of the sky outside. */
  glass: MeshStandardMaterial;
}

const setColor = (color: Color, [r, g, b]: Rgb01) => color.setRGB(r, g, b, SRGBColorSpace);

/**
 * Writes a look into the lights, the environment strength and the window glass. Values only
 * (intensity, colour, opacity), never `visible`, light types or shadows: nothing recompiles.
 * Allocation-free, so it can run on every frame of a transition.
 */
export function applyLook(targets: LookTargets, look: LightingLook): void {
  const { rig, scene, glass } = targets;
  setColor(rig.hemisphere.color, look.sky);
  setColor(rig.hemisphere.groundColor, look.ground);
  rig.hemisphere.intensity = look.hemisphere;
  setColor(rig.sun.color, look.sunColor);
  rig.sun.intensity = look.sun;
  scene.environmentIntensity = look.environment;
  setColor(glass.emissive, look.window);
  glass.emissiveIntensity = look.windowGlow;
  glass.opacity = look.windowOpacity;
}
