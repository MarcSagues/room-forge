import { describe, expect, it } from 'vitest';
import type { ObjectId, OpeningId, RoomId } from '../domain';
import { buildDocument } from '../testing';
import {
  type EntityId,
  entityExists,
  nextSelection,
  reconcileSelection,
  sameIds,
} from './selection';

const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;
const DOOR = 'door-1' as OpeningId;
const ROOM = 'room-1' as RoomId;
const GHOST = 'ghost' as ObjectId;

const doc = buildDocument();

describe('entityExists', () => {
  it('finds objects, openings and rooms, and nothing else', () => {
    expect(entityExists(doc, DESK)).toBe(true);
    expect(entityExists(doc, DOOR)).toBe(true);
    expect(entityExists(doc, ROOM)).toBe(true);
    expect(entityExists(doc, GHOST)).toBe(false);
  });

  it('is not fooled by inherited object properties', () => {
    expect(entityExists(doc, 'toString')).toBe(false);
    expect(entityExists(doc, '__proto__')).toBe(false);
  });
});

describe('nextSelection', () => {
  it('replace selects exactly the given ids, without duplicates', () => {
    expect(nextSelection(doc, [DESK], [MONITOR, MONITOR], 'replace')).toEqual([MONITOR]);
    expect(nextSelection(doc, [DESK], [], 'replace')).toEqual([]);
  });

  it('add extends the selection keeping order and ignoring repeats', () => {
    expect(nextSelection(doc, [DESK], [MONITOR, DESK, DOOR], 'add')).toEqual([DESK, MONITOR, DOOR]);
  });

  it('toggle flips each id', () => {
    expect(nextSelection(doc, [DESK, MONITOR], [MONITOR, DOOR], 'toggle')).toEqual([DESK, DOOR]);
  });

  it('ignores ids that do not exist in every mode', () => {
    for (const mode of ['replace', 'add', 'toggle'] as const) {
      expect(nextSelection(doc, [], [GHOST], mode)).toEqual([]);
    }
    expect(nextSelection(doc, [DESK], [GHOST, MONITOR], 'add')).toEqual([DESK, MONITOR]);
  });

  it('never mutates its inputs', () => {
    const current: EntityId[] = [DESK];
    nextSelection(doc, current, [MONITOR], 'add');
    nextSelection(doc, current, [DESK], 'toggle');
    expect(current).toEqual([DESK]);
  });
});

describe('reconcileSelection', () => {
  it('returns the very same array when nothing was removed', () => {
    const selection = [DESK, DOOR];
    expect(reconcileSelection(doc, selection)).toBe(selection);
  });

  it('drops ids that no longer exist and keeps the order of the rest', () => {
    expect(reconcileSelection(doc, [GHOST, DESK, 'gone-2' as ObjectId, MONITOR])).toEqual([
      DESK,
      MONITOR,
    ]);
  });

  it('can end up empty', () => {
    expect(reconcileSelection(doc, [GHOST])).toEqual([]);
  });
});

describe('sameIds', () => {
  it('compares by position', () => {
    expect(sameIds([DESK, MONITOR], [DESK, MONITOR])).toBe(true);
    expect(sameIds([DESK, MONITOR], [MONITOR, DESK])).toBe(false);
    expect(sameIds([DESK], [DESK, MONITOR])).toBe(false);
    expect(sameIds([], [])).toBe(true);
  });
});
