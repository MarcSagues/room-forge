import { describe, expect, it } from 'vitest';
import { emptyCatalog } from '@/asset-library';
import { createDemoSession } from './demo-session';

describe('createDemoSession', () => {
  it('starts with one 4 × 4.5 × 2.6 m room and an empty history', () => {
    const state = createDemoSession(emptyCatalog).getState();
    const rooms = Object.values(state.document.rooms);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.shape).toEqual({ kind: 'rect', width: 4, depth: 4.5 });
    expect(rooms[0]?.height).toBe(2.6);
    expect(state.history.canUndo).toBe(false);
  });

  it('gives every call an independent session', () => {
    const a = createDemoSession(emptyCatalog);
    const b = createDemoSession(emptyCatalog);
    const roomId = Object.keys(a.getState().document.rooms)[0];
    expect(roomId).toBeDefined();
    expect(Object.keys(b.getState().document.rooms)[0]).not.toBe(roomId);
  });
});
