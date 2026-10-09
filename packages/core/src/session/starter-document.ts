import { createRoom } from '../commands/room';
import type { SceneDocument } from '../domain';
import { createEmptyDocument } from '../domain';
import { DEFAULT_ROOM_SIZE, type RoomSize } from './room-presets';
import { createEditorSession } from './session';

/**
 * The document a new project starts with: one 4 × 4.5 × 2.6 m room with the default surfaces.
 * The room is made with the same command the editor uses, so it cannot drift from what the editor
 * would build. The size is the default one unless the "new room" wizard (P3-10) chose another; a
 * size outside the limits is a bug of the caller, so it throws.
 */
export function createStarterDocument(
  options: { roomName?: string } & Partial<RoomSize> = {},
): SceneDocument {
  const bootstrap = createEditorSession({
    initialDocument: createEmptyDocument(),
    catalog: { getItem: () => undefined },
  });
  const result = bootstrap.execute(
    createRoom({
      name: options.roomName ?? 'Room',
      width: options.width ?? DEFAULT_ROOM_SIZE.width,
      depth: options.depth ?? DEFAULT_ROOM_SIZE.depth,
      height: options.height ?? DEFAULT_ROOM_SIZE.height,
    }),
  );
  if (!result.ok) throw new Error(`starter room rejected: ${result.error.message}`);
  // The session freezes its document; hand out a copy the caller can use and change freely.
  return JSON.parse(JSON.stringify(bootstrap.getState().document)) as SceneDocument;
}
