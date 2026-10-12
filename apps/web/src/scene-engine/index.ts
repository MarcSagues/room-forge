/** Public API of the scene-engine module (R3F canvas, rendering, interaction). */

export type { CameraSnapshot } from './camera/camera-director';
export type { Mutate } from './canvas/mutate';
export type { RenderInfo } from './canvas/render-info';
export {
  type RoomDisplay,
  type SceneCamera,
  SceneCanvas,
  type SceneCanvasProps,
  type SceneHandle,
} from './canvas/scene-canvas';
export {
  type CapturedImage,
  CaptureError,
  type CaptureErrorCode,
  type CaptureLighting,
  type CaptureLimits,
  type CaptureRequest,
  type SceneImageApi,
} from './capture/image-api';
export type { LiveTransform } from './interaction/live-transform';
export type { PlacementApi } from './interaction/placement-api';
export type { LightPoolInfo } from './lighting/light-pool';
