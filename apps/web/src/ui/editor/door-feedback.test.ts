import {
  addObject,
  createEditorSession,
  type OpeningId,
  type RoomId,
  type SceneDocument,
  setDoorOpen,
} from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

const show = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn() });
  return { toast };
});
vi.mock('@/ui/components/toast', () => ({
  notify: (callback: (toast: typeof show.toast) => void) => callback(show.toast),
}));

const { attachDoorFeedback } = await import('./door-feedback');

const DOOR = 'door-1' as OpeningId;
const catalog = createFixtureCatalog();

function setup(initialDocument: SceneDocument = buildDocument()) {
  const session = createEditorSession({ initialDocument, catalog });
  const detach = attachDoorFeedback(session, catalog);
  return { session, detach };
}

afterEach(() => vi.clearAllMocks());

describe('attachDoorFeedback', () => {
  it('warns when an opened door sweeps over furniture, without undoing it', () => {
    const { session, detach } = setup();
    // door-1 on the south wall covers x 2.6–3.5 and sweeps 0.9 m into the room when open.
    session.execute(
      addObject({
        catalogId: 'chair.office',
        roomId: 'room-1' as RoomId,
        position: [3, 0, 2.5],
        rotationY: 0,
      }),
    );
    session.execute(setDoorOpen(DOOR, 1));
    expect(show.toast.warning).toHaveBeenCalledWith(
      'The open door sweeps over an object.',
      expect.anything(),
    );
    expect(session.getState().document.openings[DOOR]?.open).toBe(1);
    detach();
  });

  it('says nothing for a clear sweep or a closing door', () => {
    const { session, detach } = setup();
    session.execute(setDoorOpen(DOOR, 1));
    session.execute(setDoorOpen(DOOR, 0));
    expect(show.toast.warning).not.toHaveBeenCalled();
    detach();
  });

  it('stops listening after cleanup', () => {
    const { session, detach } = setup();
    detach();
    session.execute(
      addObject({
        catalogId: 'chair.office',
        roomId: 'room-1' as RoomId,
        position: [3, 0, 2.5],
        rotationY: 0,
      }),
    );
    session.execute(setDoorOpen(DOOR, 1));
    expect(show.toast.warning).not.toHaveBeenCalled();
  });
});
