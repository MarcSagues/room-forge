'use client';

import { useFrame, useThree } from '@react-three/fiber';
import {
  DAY_NIGHT_TRANSITION_MS,
  type DeepReadonly,
  type LightQuality,
  roomsBounds,
  type SceneDocument,
} from '@roomforge/core';
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { PCFShadowMap, type Scene, type WebGLRenderer } from 'three';
import { prefersReducedMotion } from '../camera/reduced-motion';
import { useSceneSession, useTransientStore } from '../canvas/scene-context';
import { openingResources } from '../room/opening-resources';
import { WALL_THICKNESS } from '../room/room-geometry';
import { DayNightDriver, type DayNightInfo } from './day-night-driver';
import { createEnvironment } from './environment';
import { createGlobalLightRig, frameSun } from './global-lights';
import type { ShadowRefresh } from './shadow-refresh';

/** Longest step a transition takes in one frame: the first frame after idling still animates. */
const MAX_STEP_MS = 50;

/** What the scene handle reads from the global lighting. */
export interface GlobalLightingReport {
  /** How many frames redrew the sun's shadow map since the canvas started. */
  shadowRefreshes(): number;
  dayNight(): DayNightInfo;
}

/**
 * The global lighting (P5-06): a hemisphere light, the sun (the scene's only shadow caster, with a
 * static shadow map) and a procedural environment, made once per quality level. The document's
 * `lighting.mode` picks day or night and the driver eases towards it, asking for frames only while
 * it moves; then the canvas is idle again.
 */
export function GlobalLighting({
  quality,
  shadows,
  report,
}: {
  quality: LightQuality;
  shadows: ShadowRefresh;
  report?: RefObject<GlobalLightingReport | null>;
}) {
  const session = useSceneSession();
  const transient = useTransientStore();
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const rig = useMemo(() => createGlobalLightRig(quality), [quality]);
  const driver = useMemo(
    () =>
      new DayNightDriver(
        { rig, scene, glass: openingResources().materials.glass },
        prefersReducedMotion() ? 0 : DAY_NIGHT_TRANSITION_MS,
        session.store.getState().document.lighting.mode,
      ),
    [rig, scene, session],
  );
  const transitioning = useRef(false);

  useShadowMap(gl, scene, shadows);
  useEnvironment(gl, scene, shadows, invalidate);
  useEffect(() => () => rig.sun.shadow.dispose(), [rig]);

  useEffect(() => {
    const place = (document: DeepReadonly<SceneDocument>) => {
      const bounds = roomsBounds(Object.values(document.rooms), WALL_THICKNESS);
      if (bounds) frameSun(rig.sun, bounds, document.lighting.sunAzimuth);
    };
    place(session.store.getState().document);
    shadows.request();
    invalidate();
    const offDocument = session.store.subscribe(({ document }, { document: previous }) => {
      if (document === previous) return;
      const sunMoved =
        document.rooms !== previous.rooms ||
        document.lighting.sunAzimuth !== previous.lighting.sunAzimuth;
      if (sunMoved) place(document);
      // The mode changes only values: no caster moved, so the shadow map stays as it is.
      if (
        sunMoved ||
        document.objects !== previous.objects ||
        document.openings !== previous.openings
      ) {
        shadows.request();
      }
    });
    // A drag moves objects or redraws a wall outside the document, once per frame at most.
    const offTransient = transient.subscribe(() => shadows.request());
    return () => {
      offDocument();
      offTransient();
    };
  }, [session, transient, rig, shadows, invalidate]);

  useEffect(() => {
    if (!report) return;
    const made: GlobalLightingReport = {
      shadowRefreshes: () => shadows.count(),
      dayNight: () => ({
        mode: session.store.getState().document.lighting.mode,
        level: driver.level,
        transitioning: transitioning.current,
      }),
    };
    report.current = made;
    return () => {
      if (report.current === made) report.current = null;
    };
  }, [report, session, driver, shadows]);

  useFrame((state, delta) => {
    const mode = session.store.getState().document.lighting.mode;
    transitioning.current = driver.step(mode, Math.min(delta * 1000, MAX_STEP_MS));
    if (transitioning.current) state.invalidate();
  });

  return <primitive object={rig.group} dispose={null} />;
}

/** Shadows on, drawn on demand only (ADR-0006), before the first frame compiles any material. */
function useShadowMap(gl: WebGLRenderer, scene: Scene, shadows: ShadowRefresh) {
  useLayoutEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.type = PCFShadowMap;
    // three.js calls `scene.onBeforeRender` just before it draws the shadow map (or not).
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = (...args) => {
      previous.apply(scene, args);
      shadows.beforeRender();
    };
    return () => {
      scene.onBeforeRender = previous;
    };
  }, [gl, scene, shadows]);
}

/** Bakes the environment once, and again after a lost context comes back. */
function useEnvironment(
  gl: WebGLRenderer,
  scene: Scene,
  shadows: ShadowRefresh,
  invalidate: () => void,
) {
  useLayoutEffect(() => {
    let environment = bake(gl);
    scene.environment = environment.texture;
    // A lost context takes both textures drawn on the GPU with it: bake the environment again and
    // redraw the shadow map once three.js has restored its state (its listener runs first).
    const restore = () => {
      environment.dispose();
      environment = bake(gl);
      scene.environment = environment.texture;
      shadows.request();
      invalidate();
    };
    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextrestored', restore);
    return () => {
      canvas.removeEventListener('webglcontextrestored', restore);
      if (scene.environment === environment.texture) scene.environment = null;
      environment.dispose();
    };
  }, [gl, scene, shadows, invalidate]);
}

/** Baking renders, but the frame counter must only count the canvas' own frames. */
function bake(gl: WebGLRenderer) {
  const frame = gl.info.render.frame;
  const environment = createEnvironment(gl);
  gl.info.render.frame = frame;
  return environment;
}
