import type { CaptureErrorCode, SceneImageApi } from '@/scene-engine';
import { type ImageQuality, type ImageScale, planImage } from './image-plan';

/** What fills the pixels where no scene is drawn. */
export type ImageBackground =
  | { kind: 'viewport' }
  | { kind: 'transparent' }
  | { kind: 'color'; color: string };

export interface ImageOptions {
  scale: ImageScale;
  quality: ImageQuality;
  background: ImageBackground;
}

export type ImageStage = 'rendering' | 'encoding';

export type ImageErrorCode = 'context-lost' | 'too-large' | 'failed';

export class ImageExportError extends Error {
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.name = 'ImageExportError';
    this.code = code;
  }
}

export interface RenderedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** The size an export with `options` will have on this device, and whether it had to shrink. */
export function planFor(source: SceneImageApi, options: Pick<ImageOptions, 'scale' | 'quality'>) {
  return planImage({
    viewport: source.viewportSize(),
    scale: options.scale,
    quality: options.quality,
    limits: source.limits(),
  });
}

/**
 * The scene as a PNG: planned within the device's limits, rendered off screen without the editor
 * overlays, then put on a 2D canvas over the chosen background and encoded by the browser (off the
 * main thread). Throws `ImageExportError`.
 */
export async function renderPng(
  source: SceneImageApi,
  options: ImageOptions,
  onStage: (stage: ImageStage) => void = () => {},
): Promise<RenderedImage> {
  const plan = planFor(source, options);
  onStage('rendering');
  let image: Awaited<ReturnType<SceneImageApi['capture']>>;
  try {
    image = await source.capture({
      width: plan.width,
      height: plan.height,
      samples: plan.samples,
      transparent: options.background.kind === 'transparent',
      lighting: 'current',
    });
  } catch (error) {
    throw new ImageExportError(captureCode(error), error instanceof Error ? error.message : '');
  }
  onStage('encoding');
  const background =
    options.background.kind === 'viewport'
      ? source.backdrop()
      : options.background.kind === 'color'
        ? options.background.color
        : null;
  const blob = await encodePng(image, background);
  return { blob, width: image.width, height: image.height };
}

const CAPTURE_CODES: readonly string[] = [
  'context-lost',
  'too-large',
  'failed',
] satisfies CaptureErrorCode[];

/**
 * The reason of a `CaptureError`, read by name rather than `instanceof`: this module is loaded on
 * demand and only needs the scene engine's types.
 */
function captureCode(error: unknown): ImageErrorCode {
  const code = (error as { name?: unknown; code?: unknown } | null)?.code;
  return error instanceof Error &&
    error.name === 'CaptureError' &&
    typeof code === 'string' &&
    CAPTURE_CODES.includes(code)
    ? (code as ImageErrorCode)
    : 'failed';
}

/** `background` is painted behind the image (`null` keeps its transparency). */
export async function encodePng(
  image: { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> },
  background: string | null,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageExportError('too-large', 'No 2D canvas of this size');
  try {
    context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    if (background !== null) {
      context.globalCompositeOperation = 'destination-over';
      context.fillStyle = background;
      context.fillRect(0, 0, image.width, image.height);
    }
  } catch (error) {
    throw new ImageExportError('too-large', error instanceof Error ? error.message : String(error));
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  // Let the browser drop the pixels now rather than whenever the canvas is collected.
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new ImageExportError('too-large', 'The browser could not encode the image');
  return blob;
}
