import type { WebGLRenderer } from 'three';
import type { CaptureLimits } from './image-api';

/** Never above this, whatever the GPU says: the 2D canvas that encodes the PNG has limits too. */
const HARD_MAX_SIDE = 8192;

/** What the GPU allows (read once per call: cheap, and it can change after a context restore). */
export function captureLimits(gl: WebGLRenderer): CaptureLimits {
  const context = gl.getContext();
  const viewport = context.getParameter(context.MAX_VIEWPORT_DIMS) as ArrayLike<number> | null;
  const renderbuffer = context.getParameter(context.MAX_RENDERBUFFER_SIZE) as number | null;
  const maxSide = Math.min(
    HARD_MAX_SIDE,
    gl.capabilities.maxTextureSize,
    renderbuffer ?? HARD_MAX_SIDE,
    viewport?.[0] ?? HARD_MAX_SIDE,
    viewport?.[1] ?? HARD_MAX_SIDE,
  );
  return { maxSide, maxSamples: gl.capabilities.maxSamples };
}
