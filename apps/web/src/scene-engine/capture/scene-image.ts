import type { Camera, Scene, WebGLRenderer } from 'three';
import { readBackdrop } from './backdrop';
import { captureImage } from './capture-image';
import type { SceneImageApi } from './image-api';
import { captureLimits } from './limits';

/**
 * The image API of a mounted canvas. This module (with the off-screen render and its output pass)
 * is loaded the first time an image is exported: the editor starts without it.
 */
export function createSceneImageApi(deps: {
  gl: WebGLRenderer;
  scene: Scene;
  camera: () => Camera;
  size: () => { width: number; height: number };
  invalidate: () => void;
}): SceneImageApi {
  const { gl, scene } = deps;
  return {
    viewportSize: () => {
      const { width, height } = deps.size();
      return { width, height };
    },
    limits: () => captureLimits(gl),
    backdrop: () => readBackdrop(gl.domElement),
    capture: async (request) => {
      try {
        return await captureImage({ gl, scene, camera: deps.camera() }, request);
      } finally {
        deps.invalidate(); // the live view draws a fresh frame of its own state
      }
    },
  };
}
