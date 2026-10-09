import { createRoom } from '../commands/room';
import type { SceneDocument } from '../domain';
import { createEmptyDocument } from '../domain';
import { createEditorSession } from './session';

/**
 * The document a new project starts with: one 4 × 4.5 × 2.6 m room with the default surfaces.
 * The room is made with the same command the editor uses, so it cannot drift from what the editor
 * would build. The "new room" wizard (P3-10) will let people choose the size.
 */
export function createStarterDocument(options: { roomName?: string } = {}): SceneDocument {
  const bootstrap = createEditorSession({
    initialDocument: createEmptyDocument(),
    catalog: { getItem: () => undefined },
  });
  const result = bootstrap.execute(
    createRoom({ name: options.roomName ?? 'Room', width: 4, depth: 4.5, height: 2.6 }),
  );
  if (!result.ok) throw new Error(`starter room rejected: ${result.error.message}`);
  // The session freezes its document; hand out a copy the caller can use and change freely.
  return JSON.parse(JSON.stringify(bootstrap.getState().document)) as SceneDocument;
}
