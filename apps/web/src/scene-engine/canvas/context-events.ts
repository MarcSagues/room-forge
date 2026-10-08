export interface ContextHandlers {
  onLost?: () => void;
  onRestored?: () => void;
}

/**
 * Watches the WebGL context of a canvas. On loss we call `preventDefault()` — without it the
 * browser never fires `webglcontextrestored` — and tell the caller; recovery UX is P7-08.
 * Returns the cleanup.
 */
export function watchContext(canvas: HTMLCanvasElement, handlers: ContextHandlers): () => void {
  const lost = (event: Event) => {
    event.preventDefault();
    handlers.onLost?.();
  };
  const restored = () => handlers.onRestored?.();
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}
