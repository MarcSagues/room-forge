/** Public API of the scene-engine module (R3F canvas, rendering, interaction). */

export type { CameraSnapshot } from './camera/camera-director';
export type { Mutate } from './canvas/mutate';
export type { RenderInfo } from './canvas/render-info';
export {
  type SceneCamera,
  SceneCanvas,
  type SceneCanvasProps,
  type SceneHandle,
} from './canvas/scene-canvas';
