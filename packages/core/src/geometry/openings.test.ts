import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { moveOpening } from '../commands';
import { LIMITS, type OpeningId, WALL_IDS, type WallId } from '../domain';
import { createEditorSession } from '../session';
import { buildDocument, buildOpening, buildRoom, createFixtureCatalog } from '../testing';
import {
  intersectRayWall,
  type OpeningOffsetInput,
  pickWall,
  solveOpeningOffset,
  type WallHit,
  wallLength,
  wallPoint,
  wallU,
} from './index';

const ROOM = { width: 4, depth: 3, height: 2.5 };
const hit = (): WallHit => ({ wall: 'north', u: 0, v: 0, t: 0 });
const result = () => ({ offset: 0, valid: false, reason: null });

describe('wall frames', () => {
  it('measures north/south along the width and east/west along the depth', () => {
    expect(wallLength(ROOM, 'north')).toBe(4);
    expect(wallLength(ROOM, 'south')).toBe(4);
    expect(wallLength(ROOM, 'east')).toBe(3);
    expect(wallLength(ROOM, 'west')).toBe(3);
  });

  it('runs clockwise seen from above, from each wall’s starting corner', () => {
    const out: [number, number] = [0, 0];
    expect(wallPoint(ROOM, 'north', 1, out)).toEqual([1, 0]);
    expect(wallPoint(ROOM, 'east', 1, out)).toEqual([4, 1]);
    expect(wallPoint(ROOM, 'south', 1, out)).toEqual([3, 3]);
    expect(wallPoint(ROOM, 'west', 1, out)).toEqual([0, 2]);
  });

  it('projects a floor point back onto each wall (the inverse of wallPoint)', () => {
    const out: [number, number] = [0, 0];
    for (const wall of WALL_IDS) {
      const [x, z] = wallPoint(ROOM, wall, 1.3, out);
      expect(wallU(ROOM, wall, x, z)).toBeCloseTo(1.3);
    }
  });
});

describe('intersectRayWall', () => {
  it('finds where a ray from inside the room meets each interior face', () => {
    const origin = [2, 1, 1.5] as const;
    const cases: [WallId, readonly [number, number, number], number][] = [
      ['north', [0.5, 0, -1], 2.75],
      ['east', [1, 0, 0.5], 2.5],
      ['south', [-0.5, 0, 1], 2.75],
      ['west', [-1, 0, -0.5], 2.5],
    ];
    for (const [wall, direction, u] of cases) {
      const out = hit();
      expect(intersectRayWall(ROOM, wall, origin, direction, true, out)).toBe(true);
      expect(out.wall).toBe(wall);
      expect(out.u).toBeCloseTo(u);
      expect(out.v).toBeCloseTo(1);
      expect(out.t).toBeGreaterThan(0);
    }
  });

  it('ignores the back of a face only when asked to', () => {
    // From outside, south of the room, looking north: the south wall is hit from behind.
    const out = hit();
    expect(intersectRayWall(ROOM, 'south', [2, 1, 5], [0, 0, -1], true, out)).toBe(false);
    expect(intersectRayWall(ROOM, 'south', [2, 1, 5], [0, 0, -1], false, out)).toBe(true);
    expect(out.u).toBeCloseTo(2);
  });

  it('misses when the ray is parallel to the wall or points away from it', () => {
    const out = hit();
    expect(intersectRayWall(ROOM, 'north', [2, 1, 1], [1, 0, 0], false, out)).toBe(false);
    expect(intersectRayWall(ROOM, 'north', [2, 1, 1], [0, 0, 1], false, out)).toBe(false);
  });
});

describe('pickWall', () => {
  it('picks the far wall through the open side of the room (front faces only)', () => {
    // A camera south-east of the room, above it, looking north-west down into the room.
    const out = hit();
    expect(pickWall(ROOM, [6, 4, 6], [-0.55, -0.3, -0.78], out)).toBe(true);
    expect(out.wall === 'north' || out.wall === 'west').toBe(true);
    expect(out.u).toBeGreaterThanOrEqual(0);
    expect(out.u).toBeLessThanOrEqual(wallLength(ROOM, out.wall));
    expect(out.v).toBeGreaterThanOrEqual(0);
    expect(out.v).toBeLessThanOrEqual(ROOM.height);
  });

  it('looking straight down, takes the wall next to the floor point under the pointer', () => {
    const out = hit();
    expect(pickWall(ROOM, [1.2, 10, 0.2], [0, -1, 0], out)).toBe(true);
    expect(out).toMatchObject({ wall: 'north' });
    expect(out.u).toBeCloseTo(1.2);
    expect(pickWall(ROOM, [3.9, 10, 2], [0, -1, 0], out)).toBe(true);
    expect(out).toMatchObject({ wall: 'east' });
    expect(out.u).toBeCloseTo(2);
  });

  it('finds nothing in the middle of the floor seen from above or above the walls', () => {
    const out = hit();
    expect(pickWall(ROOM, [2, 10, 1.5], [0, -1, 0], out)).toBe(false);
    expect(pickWall(ROOM, [2, 10, 1.5], [0, 1, 0], out)).toBe(false);
  });
});

const input = (overrides: Partial<OpeningOffsetInput> = {}): OpeningOffsetInput => ({
  length: 4,
  roomHeight: 2.5,
  width: 0.9,
  height: 2.1,
  sill: 0,
  offset: 1,
  others: [],
  ...overrides,
});

describe('solveOpeningOffset', () => {
  it('keeps a free offset and snaps it to the grid along the wall', () => {
    expect(solveOpeningOffset(input({ offset: 1.234 }), result())).toEqual({
      offset: 1.234,
      valid: true,
      reason: null,
    });
    const snapped = solveOpeningOffset(input({ offset: 1.234, gridStep: 0.1 }), result());
    expect(snapped.offset).toBeCloseTo(1.2);
  });

  it('slides the opening clear of the corners (the margin of I4)', () => {
    const margin = LIMITS.openingCornerMargin;
    expect(solveOpeningOffset(input({ offset: -2 }), result()).offset).toBeCloseTo(margin);
    expect(solveOpeningOffset(input({ offset: 9 }), result()).offset).toBeCloseTo(4 - margin - 0.9);
  });

  it('flags an opening wider than the wall or taller than the room', () => {
    expect(solveOpeningOffset(input({ width: 3.9 }), result())).toMatchObject({
      valid: false,
      reason: 'too-wide',
    });
    expect(solveOpeningOffset(input({ sill: 0.9, height: 1.8 }), result())).toMatchObject({
      valid: false,
      reason: 'too-tall',
    });
  });

  it('flags an overlap with another opening of the wall, but not touching edges', () => {
    const others = [{ offset: 2, width: 1 }];
    expect(solveOpeningOffset(input({ offset: 1.5, others }), result())).toMatchObject({
      valid: false,
      reason: 'overlap',
    });
    expect(solveOpeningOffset(input({ offset: 1.1, others }), result()).valid).toBe(true);
    // Only the first `othersCount` entries count (preallocated scratch lists).
    expect(solveOpeningOffset(input({ offset: 1.5, others, othersCount: 0 }), result()).valid).toBe(
      true,
    );
  });

  it('agrees with opening/move: valid exactly when the command accepts that offset', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...WALL_IDS),
        fc.double({ min: -1, max: 6, noNaN: true }),
        fc.double({ min: 0.3, max: 1.4, noNaN: true }),
        fc.option(fc.constantFrom(0.05, 0.1, 0.25), { nil: undefined }),
        (wall, desired, width, gridStep) => {
          const room = buildRoom({ shape: { kind: 'rect', width: 4, depth: 3 }, height: 2.5 });
          const moving = buildOpening({ id: 'moving', wall, offset: 0.1, width, sill: 0 });
          const fixed = buildOpening({ id: 'fixed', wall, offset: 2.4, width: 0.5 });
          const doc = {
            ...buildDocument(),
            rooms: { [room.id]: room },
            openings: { [moving.id]: moving, [fixed.id]: fixed },
          };
          const session = createEditorSession({
            initialDocument: doc,
            catalog: createFixtureCatalog(),
          });
          const solved = solveOpeningOffset(
            {
              length: wallLength({ width: 4, depth: 3 }, wall),
              roomHeight: 2.5,
              width,
              height: moving.height,
              sill: 0,
              offset: desired,
              ...(gridStep ? { gridStep } : {}),
              others: [fixed],
            },
            result(),
          );
          const outcome = session.execute(moveOpening('moving' as OpeningId, solved));
          expect(outcome.ok).toBe(solved.valid);
          if (outcome.ok) {
            const stored = session.getState().document.openings['moving' as OpeningId];
            expect(stored?.offset).toBeCloseTo(solved.offset, 9);
            // Solving its own result changes nothing.
            const again = solveOpeningOffset(
              {
                length: wallLength({ width: 4, depth: 3 }, wall),
                roomHeight: 2.5,
                width,
                height: moving.height,
                sill: 0,
                offset: solved.offset,
                ...(gridStep ? { gridStep } : {}),
                others: [fixed],
              },
              result(),
            );
            expect(again.offset).toBeCloseTo(solved.offset, 9);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
