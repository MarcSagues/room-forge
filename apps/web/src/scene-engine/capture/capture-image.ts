import {
  type Camera,
  Color,
  HalfFloatType,
  type Scene,
  UnsignedByteType,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { hideOverlays } from '../canvas/overlay';
import { type CapturedImage, CaptureError, type CaptureRequest } from './image-api';
import { captureLimits } from './limits';
import { toImageRows } from './pixels';

export interface CaptureTarget {
  gl: WebGLRenderer;
  scene: Scene;
  camera: Camera;
}

/**
 * Renders the scene once into an off-screen MSAA target (HDR when the GPU can) with the editor
 * overlays hidden, applies the viewport's tone mapping and colour space with an `OutputPass` (the
 * renderer only applies them on screen), and reads the result back without stalling the page.
 * Everything it changes on the renderer and the scene is put back before it awaits anything, so
 * the live canvas never draws a frame in the export's state. `preserveDrawingBuffer` is not used
 * (ARCHITECTURE §6.6).
 */
export async function captureImage(
  target: CaptureTarget,
  request: CaptureRequest,
): Promise<CapturedImage> {
  const { gl, scene, camera } = target;
  const context = gl.getContext();
  if (context.isContextLost()) throw new CaptureError('context-lost', 'The WebGL context is lost');
  const { width, height } = request;
  const limits = captureLimits(gl);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > limits.maxSide ||
    height > limits.maxSide
  ) {
    throw new CaptureError('too-large', `${width} × ${height} is beyond ${limits.maxSide} px`);
  }

  const samples = Math.max(0, Math.min(Math.floor(request.samples), limits.maxSamples));
  const hdrType = gl.extensions.has('EXT_color_buffer_float') ? HalfFloatType : UnsignedByteType;
  const hdr = new WebGLRenderTarget(width, height, { samples, type: hdrType });
  const ldr = new WebGLRenderTarget(width, height, { type: UnsignedByteType, depthBuffer: false });
  const output = new OutputPass();

  const previousTarget = gl.getRenderTarget();
  const previousClear = gl.getClearColor(new Color());
  const previousAlpha = gl.getClearAlpha();
  const previousBackground = scene.background;
  const showOverlays = hideOverlays(scene);
  try {
    if (request.transparent) scene.background = null;
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(hdr);
    if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
      throw new CaptureError('too-large', 'The GPU cannot make a target this large');
    }
    gl.clear();
    gl.render(scene, camera);
    output.render(gl, ldr, hdr, 0, false);
    if (context.getError() === context.OUT_OF_MEMORY) {
      throw new CaptureError('too-large', 'The GPU ran out of memory');
    }
  } catch (error) {
    hdr.dispose();
    ldr.dispose();
    output.dispose();
    throw asCaptureError(error, context);
  } finally {
    showOverlays();
    scene.background = previousBackground;
    gl.setRenderTarget(previousTarget);
    gl.setClearColor(previousClear, previousAlpha);
  }
  hdr.dispose();
  output.dispose();

  try {
    const pixels = new Uint8Array(width * height * 4);
    await gl.readRenderTargetPixelsAsync(ldr, 0, 0, width, height, pixels);
    if (context.isContextLost()) throw new CaptureError('context-lost', 'The context was lost');
    toImageRows(pixels, width, height);
    return { width, height, data: new Uint8ClampedArray(pixels.buffer) };
  } catch (error) {
    throw asCaptureError(error, context);
  } finally {
    ldr.dispose();
  }
}

function asCaptureError(
  error: unknown,
  context: WebGLRenderingContext | WebGL2RenderingContext,
): CaptureError {
  if (error instanceof CaptureError) return error;
  if (context.isContextLost()) return new CaptureError('context-lost', 'The context was lost');
  if (error instanceof RangeError) return new CaptureError('too-large', error.message);
  return new CaptureError('failed', error instanceof Error ? error.message : String(error));
}
