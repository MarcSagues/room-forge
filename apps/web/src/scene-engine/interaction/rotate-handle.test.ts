import { createEditorSession, type EditorSession, type ObjectId } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { Ray, Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  HANDLE_GAP,
  handleRadius,
  handleTarget,
  hitsHandle,
  knobPosition,
  RING_BAND,
} from './rotate-handle';

const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;

let session: EditorSession;
beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
});

describe('handleTarget', () => {
  it('is the single selected floor object', () => {
    expect(handleTarget(session.getState())).toBeNull();
    session.select([DESK], 'replace');
    expect(handleTarget(session.getState())).toBe(DESK);
  });

  it('is nobody for several objects, a stacked one, or a locked or hidden one', () => {
    session.select([DESK, MONITOR], 'replace');
    expect(handleTarget(session.getState())).toBeNull();
    session.select([MONITOR], 'replace');
    expect(handleTarget(session.getState())).toBeNull();
    session.select([DESK], 'replace');
    for (const flag of ['locked', 'hidden'] as const) {
      session.execute({
        type: `test/${flag}`,
        label: flag,
        apply(draft) {
          const target = draft.objects[DESK];
          if (target) target[flag] = true;
        },
      });
      expect(handleTarget(session.getState())).toBeNull();
      session.undo();
      expect(handleTarget(session.getState())).toBe(DESK);
    }
  });
});

describe('handleRadius', () => {
  it('clears the corners of the footprint by a fixed gap', () => {
    expect(handleRadius({ w: 1.2, d: 0.6 }, [1, 1, 1])).toBeCloseTo(
      Math.hypot(1.2, 0.6) / 2 + HANDLE_GAP,
    );
  });

  it('follows the object scale', () => {
    expect(handleRadius({ w: 1, d: 1 }, [2, 1, 1])).toBeCloseTo(Math.hypot(2, 1) / 2 + HANDLE_GAP);
  });
});

describe('knobPosition', () => {
  it('sits in front of the object (+z at rotation 0) and turns with it', () => {
    const out: [number, number] = [0, 0];
    expect(knobPosition(2, 1.5, 0, 1, out)).toEqual([2, 2.5]);
    knobPosition(2, 1.5, Math.PI / 2, 1, out);
    expect(out[0]).toBeCloseTo(3);
    expect(out[1]).toBeCloseTo(1.5);
  });
});

describe('hitsHandle', () => {
  const centre = { x: 2, z: 1.5 };
  const radius = 1;
  const down = (x: number, z: number) => new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0));
  const hit = (ray: Ray, rotationY = 0, objectUnder = false) =>
    hitsHandle(ray, centre.x, centre.z, rotationY, radius, objectUnder);

  it('grabs the knob', () => {
    expect(hit(down(2, 2.5))).toBe(true);
    expect(hit(down(2.05, 2.55))).toBe(true);
    expect(hit(down(3, 1.5), Math.PI / 2)).toBe(true); // the knob went with the object
    expect(hit(down(3, 1.5), 0, true)).toBe(false); // …and is not where it was
  });

  it('grabs the ring where nothing else is under the pointer', () => {
    expect(hit(down(2 + Math.sin(1) * radius, 1.5 + Math.cos(1) * radius))).toBe(true);
    expect(hit(down(2, 0.5))).toBe(true);
  });

  it('leaves the ring to an object that is under the pointer, but keeps the knob', () => {
    expect(hit(down(2, 0.5), 0, true)).toBe(false);
    expect(hit(down(2, 2.5), 0, true)).toBe(true);
  });

  it('misses inside and outside the ring', () => {
    expect(hit(down(2, 1.5))).toBe(false);
    expect(hit(down(2 + radius + RING_BAND + 0.1, 1.5))).toBe(false);
    expect(hit(down(2 + radius - RING_BAND - 0.1, 1.5))).toBe(false);
  });

  it('misses a ray that does not reach the floor', () => {
    expect(hit(new Ray(new Vector3(2, 10, 2.5), new Vector3(0, 1, 0)))).toBe(false);
  });
});
