/** What the GPU of this device can render off screen. */
export interface CaptureLimits {
  /** Longest side of a render target, in pixels (texture, renderbuffer and viewport limits). */
  maxSide: number;
  /** Most MSAA samples a render target may have. */
  maxSamples: number;
}

/**
 * The lighting an image is rendered with. Only the lighting on screen exists today; the day/night
 * presets (P5-06) arrive as more values here.
 */
export type CaptureLighting = 'current';

export interface CaptureRequest {
  /** Size of the image in pixels; its aspect should be the viewport's (same camera). */
  width: number;
  height: number;
  /** MSAA samples; clamped to `CaptureLimits.maxSamples`. 0 turns anti-aliasing off. */
  samples: number;
  /** Leave the scene background out (if it has one): empty pixels keep alpha 0. */
  transparent: boolean;
  lighting: CaptureLighting;
}

/** An image of the scene: RGBA rows from the top, non-premultiplied (ready for `ImageData`). */
export interface CapturedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export type CaptureErrorCode = 'context-lost' | 'too-large' | 'failed';

export class CaptureError extends Error {
  readonly code: CaptureErrorCode;
  constructor(code: CaptureErrorCode, message: string) {
    super(message);
    this.name = 'CaptureError';
    this.code = code;
  }
}

/**
 * Pictures of the scene as the viewport shows it, minus the editor overlays (grid, selection,
 * handles, guides, ghosts). Rendered off screen: the live canvas is neither resized nor redrawn
 * with anything else, and is asked for a fresh frame once the capture is done.
 */
export interface SceneImageApi {
  /** Size of the viewport in CSS pixels. */
  viewportSize(): { width: number; height: number };
  limits(): CaptureLimits;
  /** The colour the page shows behind the canvas (the canvas itself is transparent). */
  backdrop(): string;
  capture(request: CaptureRequest): Promise<CapturedImage>;
}
