import { describe, expect, it } from 'vitest';
import { LIMITS } from '../domain';
import { DEFAULT_ROOM_SIZE, ROOM_PRESETS } from './room-presets';
import { createStarterDocument } from './starter-document';

describe('ROOM_PRESETS', () => {
  it('offers the three sizes of the PRD, with a name in each language', () => {
    expect(ROOM_PRESETS.map(({ id, width, depth }) => [id, width, depth])).toEqual([
      ['small', 3, 3],
      ['office', 4, 3.5],
      ['gaming', 4, 4.5],
    ]);
    for (const preset of ROOM_PRESETS) {
      expect(preset.name.en).not.toBe('');
      expect(preset.name.es).not.toBe('');
    }
  });

  it('only offers sizes inside the limits, each one a room that can be made', () => {
    for (const { width, depth, height, id } of ROOM_PRESETS) {
      expect(width, id).toBeGreaterThanOrEqual(LIMITS.roomSide.min);
      expect(width, id).toBeLessThanOrEqual(LIMITS.roomSide.max);
      expect(depth, id).toBeGreaterThanOrEqual(LIMITS.roomSide.min);
      expect(depth, id).toBeLessThanOrEqual(LIMITS.roomSide.max);
      expect(height, id).toBeGreaterThanOrEqual(LIMITS.roomHeight.min);
      expect(height, id).toBeLessThanOrEqual(LIMITS.roomHeight.max);
      expect(() => createStarterDocument({ width, depth, height }), id).not.toThrow();
    }
  });

  it('has unique ids and the default size is one of them', () => {
    expect(new Set(ROOM_PRESETS.map((preset) => preset.id)).size).toBe(ROOM_PRESETS.length);
    expect(
      ROOM_PRESETS.some(
        (preset) =>
          preset.width === DEFAULT_ROOM_SIZE.width &&
          preset.depth === DEFAULT_ROOM_SIZE.depth &&
          preset.height === DEFAULT_ROOM_SIZE.height,
      ),
    ).toBe(true);
  });
});
