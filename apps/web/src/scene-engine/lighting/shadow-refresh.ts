import { createContext, useContext } from 'react';

/** The part of `WebGLRenderer.shadowMap` the refresh drives. */
export interface ShadowMapLike {
  needsUpdate: boolean;
}

/**
 * The sun's shadow is static (ADR-0006, P2-11): `shadowMap.autoUpdate` is off and the map is only
 * drawn again on the next frame after something that casts or receives it changed. Whoever
 * changes the scene outside the document (a drag, a wall lowering, a model arriving) calls
 * `request()`; it only raises a flag, so it is free on the hot path. Camera moves never call it.
 */
export interface ShadowRefresh {
  request(): void;
  /** Called just before each frame is drawn: counts the frames that redraw the shadow map. */
  beforeRender(): void;
  /** How many times the shadow map was drawn. */
  count(): number;
}

export function createShadowRefresh(shadowMap: ShadowMapLike): ShadowRefresh {
  let count = 0;
  return {
    request() {
      shadowMap.needsUpdate = true;
    },
    beforeRender() {
      // three.js draws the map in this frame and then clears the flag.
      if (shadowMap.needsUpdate) count += 1;
    },
    count: () => count,
  };
}

const NO_REFRESH: ShadowRefresh = { request: () => {}, beforeRender: () => {}, count: () => 0 };

export const ShadowRefreshContext = createContext<ShadowRefresh>(NO_REFRESH);

/** The canvas' shadow refresh; a no-op outside one (component tests). */
export function useShadowRefresh(): ShadowRefresh {
  return useContext(ShadowRefreshContext);
}
