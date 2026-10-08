import {
  type CatalogProvider,
  createEditorSession,
  createEmptyDocument,
  createRoom,
  type EditorSession,
  type SceneDocument,
} from '@roomforge/core';

/**
 * Temporary session with one 4 × 4.5 × 2.6 m room so the viewport has something to show.
 * The room is created *before* the real session starts, so it is not an undo entry. It goes away
 * when persistence (P6) and the "new room" wizard (P3-10) land.
 */
export function createDemoSession(catalog: CatalogProvider): EditorSession {
  const bootstrap = createEditorSession({ initialDocument: createEmptyDocument(), catalog });
  const result = bootstrap.execute(createRoom({ name: 'Room', width: 4, depth: 4.5, height: 2.6 }));
  if (!result.ok) throw new Error(`demo room rejected: ${result.error.message}`);
  // The session freezes its document, so hand the new one an independent copy.
  const initialDocument = structuredClone(bootstrap.getState().document) as SceneDocument;
  return createEditorSession({ initialDocument, catalog });
}
