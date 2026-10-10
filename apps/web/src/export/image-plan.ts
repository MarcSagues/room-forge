/** Image size relative to the viewport (its CSS pixels). */
export type ImageScale = 1 | 2 | 4;
export const IMAGE_SCALES: readonly ImageScale[] = [1, 2, 4];

/** Anti-aliasing: none, the viewport's, or more. */
export type ImageQuality = 'draft' | 'standard' | 'high';
export const IMAGE_QUALITIES: readonly ImageQuality[] = ['draft', 'standard', 'high'];
const QUALITY_SAMPLES: Record<ImageQuality, number> = { draft: 0, standard: 4, high: 8 };

/**
 * Largest image, in pixels (4096², 64 MiB of RGBA). Every copy an export makes (HDR target, read
 * back, 2D canvas) is about this size or a few times it, so this keeps an export well inside
 * what a browser tab may use.
 */
export const MAX_IMAGE_PIXELS = 4096 * 4096;
/** Most pixels × MSAA samples: a large image is already sharp, and MSAA memory grows with both. */
export const MAX_SAMPLED_PIXELS = 2 ** 25;

export interface ImagePlan {
  width: number;
  height: number;
  /** What the scale asked for, before the limits. */
  requestedWidth: number;
  requestedHeight: number;
  /** The image had to be made smaller than asked: say so. */
  clamped: boolean;
  samples: number;
}

/**
 * The size and anti-aliasing of an export: the viewport times `scale`, made smaller (keeping the
 * aspect, so the camera frames the same view) when the GPU's longest side or the pixel budget is
 * exceeded; MSAA samples halved until the image fits the sample budget.
 */
export function planImage(input: {
  viewport: { width: number; height: number };
  scale: ImageScale;
  quality: ImageQuality;
  limits: { maxSide: number; maxSamples: number };
}): ImagePlan {
  const { viewport, scale, quality, limits } = input;
  const requestedWidth = Math.max(1, Math.round(viewport.width * scale));
  const requestedHeight = Math.max(1, Math.round(viewport.height * scale));
  const maxSide = Math.max(1, Math.floor(limits.maxSide));
  const factor = Math.min(
    1,
    maxSide / requestedWidth,
    maxSide / requestedHeight,
    Math.sqrt(MAX_IMAGE_PIXELS / (requestedWidth * requestedHeight)),
  );
  const width = Math.max(1, Math.min(maxSide, Math.floor(requestedWidth * factor)));
  const height = Math.max(1, Math.min(maxSide, Math.floor(requestedHeight * factor)));
  let samples = Math.max(0, Math.min(QUALITY_SAMPLES[quality], Math.floor(limits.maxSamples)));
  while (samples > 0 && width * height * samples > MAX_SAMPLED_PIXELS) samples >>= 1;
  if (samples === 1) samples = 0;
  return {
    width,
    height,
    requestedWidth,
    requestedHeight,
    clamped: width < requestedWidth || height < requestedHeight,
    samples,
  };
}
