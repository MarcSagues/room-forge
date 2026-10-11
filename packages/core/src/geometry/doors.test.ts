import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WALL_IDS } from '../domain';
import {
  DOOR_MAX_ANGLE,
  type DoorShape,
  doorAngle,
  doorLeafCount,
  doorSweepBox,
  doorSweepDepth,
  doorSweepFits,
  type FloorBox,
} from './doors';

const box = (): FloorBox => ({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 });
const door = (overrides: Partial<DoorShape> = {}): DoorShape => ({
  wall: 'north',
  variant: 'door.single',
  offset: 0.5,
  width: 0.9,
  swing: 'in',
  open: 1,
  ...overrides,
});

describe('door swing', () => {
  it('turns up to 90° and clamps the fraction', () => {
    expect(doorAngle(0)).toBe(0);
    expect(doorAngle(1)).toBe(DOOR_MAX_ANGLE);
    expect(doorAngle(2)).toBe(DOOR_MAX_ANGLE);
    expect(doorAngle(-1)).toBe(0);
  });

  it('splits a double door into two leaves', () => {
    expect(doorLeafCount('door.double')).toBe(2);
    expect(doorLeafCount('door.single')).toBe(1);
    expect(doorSweepDepth(door({ variant: 'door.double', width: 1.6 }))).toBeCloseTo(0.8);
    expect(doorSweepDepth(door({ open: 0 }))).toBe(0);
  });

  it('fits when the leaf stays short of the opposite wall', () => {
    const room = { width: 4, depth: 2 };
    expect(doorSweepFits(room, door({ width: 2 }))).toBe(true);
    expect(doorSweepFits(room, door({ width: 2.1 }))).toBe(false);
    expect(doorSweepFits(room, door({ width: 2.1, swing: 'out' }))).toBe(true);
    // East and west walls measure the room's width.
    expect(doorSweepFits(room, door({ wall: 'east', width: 1.8 }))).toBe(true);
  });

  it('sweeps a box inside the room, against its wall and within the hole', () => {
    const room = { width: 4, depth: 3 };
    fc.assert(
      fc.property(
        fc.constantFrom(...WALL_IDS),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.5, max: 1.5, noNaN: true }),
        fc.double({ min: 0.1, max: 1, noNaN: true }),
        (wall, open, width, offset) => {
          const shape = door({ wall, open, width, offset });
          const swept = doorSweepBox(room, shape, box());
          if (!swept) {
            expect(doorSweepDepth(shape)).toBeLessThanOrEqual(0.001);
            return;
          }
          expect(swept.minX).toBeGreaterThanOrEqual(-1e-9);
          expect(swept.minZ).toBeGreaterThanOrEqual(-1e-9);
          expect(swept.maxX).toBeLessThanOrEqual(room.width + 1e-9);
          expect(swept.maxZ).toBeLessThanOrEqual(room.depth + 1e-9);
          const along = wall === 'north' || wall === 'south' ? 'x' : 'z';
          const span = along === 'x' ? swept.maxX - swept.minX : swept.maxZ - swept.minZ;
          const reach = along === 'x' ? swept.maxZ - swept.minZ : swept.maxX - swept.minX;
          expect(span).toBeCloseTo(width);
          expect(reach).toBeCloseTo(doorSweepDepth(shape));
        },
      ),
    );
  });

  it('sweeps nothing inside when opening outwards', () => {
    expect(doorSweepBox({ width: 4, depth: 3 }, door({ swing: 'out' }), box())).toBe(false);
  });
});
