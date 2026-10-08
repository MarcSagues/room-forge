import { createEditorSession, createEmptyDocument, createRoom } from '@roomforge/core';
import { describe, expect, it, vi } from 'vitest';
import { emptyCatalog } from '@/asset-library';
import { connectInvalidate } from './invalidate-bridge';

function setup() {
  const session = createEditorSession({
    initialDocument: createEmptyDocument(),
    catalog: emptyCatalog,
  });
  const invalidate = vi.fn();
  return { session, invalidate };
}

const room = () => createRoom({ name: 'Room', width: 4, depth: 3, height: 2.6 });

describe('connectInvalidate', () => {
  it('requests a frame when the document changes', () => {
    const { session, invalidate } = setup();
    connectInvalidate(session, invalidate);
    session.execute(room());
    expect(invalidate).toHaveBeenCalled();
  });

  it('also requests a frame when the selection changes', () => {
    const { session, invalidate } = setup();
    session.execute(room());
    const roomId = Object.keys(session.getState().document.rooms)[0] as never;
    connectInvalidate(session, invalidate);
    invalidate.mockClear();
    session.select([roomId]);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('stays quiet when nothing visible changes', () => {
    const { session, invalidate } = setup();
    connectInvalidate(session, invalidate);
    session.setActiveTool('place');
    session.setHover(null);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does not request frames after cleanup, and survives a Strict Mode double mount', () => {
    const { session, invalidate } = setup();
    // React Strict Mode: mount, unmount, mount again.
    connectInvalidate(session, invalidate)();
    const disconnect = connectInvalidate(session, invalidate);

    session.execute(room());
    const afterOneCommand = invalidate.mock.calls.length;
    expect(afterOneCommand).toBeGreaterThan(0);

    disconnect();
    session.undo();
    expect(invalidate).toHaveBeenCalledTimes(afterOneCommand);
  });
});
