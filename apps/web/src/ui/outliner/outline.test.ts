import type { ObjectId, SceneDocument } from '@roomforge/core';
import { buildDocument, buildObject } from '@roomforge/core/testing';
import { describe, expect, it } from 'vitest';
import { buildOutline, reorderTarget, visibleRows } from './outline';

/** buildDocument plus a chair on the floor and a lamp on the desk. */
function scene(): SceneDocument {
  const doc = buildDocument();
  const chair = buildObject({ id: 'chair-1', catalogId: 'chair.office', name: 'My chair' });
  const lamp = buildObject({ id: 'lamp-1', parentId: 'desk-1', hidden: true, locked: true });
  return {
    ...doc,
    objects: { ...doc.objects, [chair.id]: chair, [lamp.id]: lamp },
    objectOrder: [...doc.objectOrder, chair.id, lamp.id],
  };
}

describe('buildOutline', () => {
  it('lists each room, then its openings, then its objects with their children nested', () => {
    const rows = buildOutline(scene());
    expect(rows.map((row) => [row.id, row.level, row.position, row.siblings])).toEqual([
      ['room-1', 1, 1, 1],
      ['door-1', 2, 1, 4],
      ['window-1', 2, 2, 4],
      ['desk-1', 2, 3, 4],
      ['monitor-1', 3, 1, 2],
      ['lamp-1', 3, 2, 2],
      ['chair-1', 2, 4, 4],
    ]);
  });

  it('carries what a row needs to be labelled and its state', () => {
    const rows = buildOutline(scene());
    const byId = (id: string) => rows.find((row) => row.id === id);
    expect(byId('room-1')).toMatchObject({ kind: 'room', name: 'Room', hasChildren: true });
    expect(byId('window-1')).toMatchObject({ kind: 'window', detail: 'north' });
    expect(byId('chair-1')).toMatchObject({ kind: 'object', name: 'My chair', hasChildren: false });
    expect(byId('lamp-1')).toMatchObject({ hidden: true, locked: true, parent: 'desk-1' });
  });

  it('skips the rows under a collapsed row, however deep', () => {
    const rows = buildOutline(scene());
    expect(visibleRows(rows, new Set(['desk-1'])).map((row) => row.id)).toEqual([
      'room-1',
      'door-1',
      'window-1',
      'desk-1',
      'chair-1',
    ]);
    expect(visibleRows(rows, new Set(['room-1'])).map((row) => row.id)).toEqual(['room-1']);
  });
});

describe('reorderTarget', () => {
  const doc = scene();
  it('swaps an object with its previous or next sibling, never with other levels', () => {
    // Floor siblings: desk-1, chair-1. On the desk: monitor-1, lamp-1.
    expect(reorderTarget(doc, 'chair-1' as ObjectId, -1)).toBe(0);
    expect(reorderTarget(doc, 'desk-1' as ObjectId, 1)).toBe(2);
    expect(reorderTarget(doc, 'lamp-1' as ObjectId, -1)).toBe(1);
  });

  it('returns null at either end and for unknown ids', () => {
    expect(reorderTarget(doc, 'desk-1' as ObjectId, -1)).toBeNull();
    expect(reorderTarget(doc, 'lamp-1' as ObjectId, 1)).toBeNull();
    expect(reorderTarget(doc, 'nope' as ObjectId, 1)).toBeNull();
  });
});
