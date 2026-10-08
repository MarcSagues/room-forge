import type { EditorSession } from '@roomforge/core';

/**
 * With `frameloop="demand"` nothing is drawn unless somebody asks for a frame (ADR-0006).
 * This connects the session to R3F's `invalidate`: whatever changes what the user sees requests
 * exactly one frame (R3F coalesces several requests made in the same tick). Returns the cleanup,
 * symmetrical so React Strict Mode's double effect is harmless.
 */
export function connectInvalidate(
  session: Pick<EditorSession, 'on'>,
  invalidate: () => void,
): () => void {
  const offs = [
    session.on('document:changed', () => invalidate()),
    session.on('selection:changed', () => invalidate()),
  ];
  return () => {
    for (const off of offs) off();
  };
}
