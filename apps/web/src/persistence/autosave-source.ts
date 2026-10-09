import type { EditorSession, SceneDocument } from '@roomforge/core';
import type { AutosaveSource } from './autosave';

/**
 * Autosave's view of an editor session: its document, and every change that has to be saved
 * (commands, undo, redo; a gesture counts once, when it ends). Selection, view and hover are
 * session state, not document, and are never saved.
 */
export function autosaveSourceOf(session: EditorSession): AutosaveSource {
  return {
    // The session's document is deeply readonly; the repository only reads it.
    document: () => session.getState().document as SceneDocument,
    onChange: (listener) => session.on('document:changed', () => listener()),
  };
}
