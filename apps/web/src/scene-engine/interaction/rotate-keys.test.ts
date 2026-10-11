import { createEditorSession, type EditorSession, type ObjectId } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attachRotateKeys } from './rotate-keys';
import { createTransientStore, type TransientStore } from './transient-store';

// Fixture room 4 × 3 at the world origin; desk-1 (1.2 × 0.6) at (2, 0, 1.5) with monitor-1 on it.
const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;
const STEP = Math.PI / 12;

let session: EditorSession;
let transient: TransientStore;
let detach: () => void;
let keyTarget: EventTarget;

const transform = (id: ObjectId) => session.getState().document.objects[id]?.transform;

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  keyTarget.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  transient = createTransientStore();
  keyTarget = new EventTarget();
  detach = attachRotateKeys({
    session,
    catalog: createFixtureCatalog(),
    transient,
    keyTarget: keyTarget as unknown as Window,
  });
  session.select([DESK], 'replace');
});

describe('attachRotateKeys', () => {
  it('R turns the selection one step, Shift+R the other way, Alt the fine step', () => {
    press('r');
    expect(transform(DESK)?.rotationY).toBeCloseTo(STEP);
    press('R', { shiftKey: true });
    press('R', { shiftKey: true });
    expect(transform(DESK)?.rotationY).toBeCloseTo(-STEP);
    press('r', { altKey: true });
    expect(transform(DESK)?.rotationY).toBeCloseTo(-STEP + Math.PI / 180);
  });

  it('24 presses bring the object back to its orientation', () => {
    for (let i = 0; i < 24; i += 1) press('r');
    const angle = transform(DESK)?.rotationY ?? Number.NaN;
    expect(Math.cos(angle)).toBeCloseTo(1, 9);
    expect(Math.sin(angle)).toBeCloseTo(0, 9);
  });

  it('keeps the position when the turned footprint still fits', () => {
    press('r');
    expect(transform(DESK)?.position).toEqual([2, 0, 1.5]);
  });

  it('turning several times in a row is one undo step', () => {
    for (let i = 0; i < 6; i += 1) press('r');
    expect(session.getState().history.undoLabel).toBe('Rotate object');
    session.undo();
    expect(transform(DESK)?.rotationY).toBe(0);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('claims the key so nothing else reacts to it', () => {
    expect(press('r').defaultPrevented).toBe(true);
    expect(press('a').defaultPrevented).toBe(false);
  });

  it('pushes an object away from a wall it would cross, in the same command', () => {
    session.execute({
      type: 'test/place',
      label: 'place',
      apply(draft) {
        const target = draft.objects[DESK];
        if (target) target.transform.position = [2, 0, 2.7]; // back against the south wall
      },
    });
    for (let i = 0; i < 6; i += 1) press('r'); // a quarter turn: 1.2 deep
    expect(transform(DESK)?.rotationY).toBeCloseTo(Math.PI / 2);
    // Pushed in as far as the widest turn needed (60°, near the diagonal), and not pulled back out.
    const widest = (Math.sin(4 * STEP) * 1.2 + Math.cos(4 * STEP) * 0.6) / 2;
    expect(transform(DESK)?.position[2]).toBeCloseTo(3 - widest);
    expect(transform(DESK)?.position[2]).toBeLessThanOrEqual(3 - 0.6);
    expect(transform(DESK)?.position[0]).toBeCloseTo(2);
  });

  it('blocks a turn that cannot fit in the room', () => {
    session.execute({
      type: 'test/widen',
      label: 'widen',
      apply(draft) {
        const target = draft.objects[DESK];
        if (target) target.transform.scale = [2, 1, 1]; // 2.4 × 0.6
        const room = Object.values(draft.rooms)[0];
        if (room) room.shape.depth = 2;
      },
    });
    // Turned by θ it is 2.4·sin θ + 0.6·cos θ deep: 1.7 at 30°, 2.1 at 45°, more than the room.
    for (let i = 0; i < 6; i += 1) press('r');
    expect(transform(DESK)?.rotationY).toBeCloseTo(2 * STEP);
  });

  it('does nothing without a selection, or with modifiers that belong to the browser', () => {
    press('r', { ctrlKey: true });
    press('r', { metaKey: true });
    expect(transform(DESK)?.rotationY).toBe(0);
    session.select([]);
    const event = press('r');
    expect(event.defaultPrevented).toBe(false);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('a held key is one press, not a spin', () => {
    press('r');
    press('r', { repeat: true });
    press('r', { repeat: true });
    expect(transform(DESK)?.rotationY).toBeCloseTo(STEP);
  });

  it('leaves the key to text fields', () => {
    detach();
    detach = attachRotateKeys({
      session,
      catalog: createFixtureCatalog(),
      transient,
      keyTarget: window,
    });
    const input = document.body.appendChild(document.createElement('input'));
    const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    input.remove();
    expect(transform(DESK)?.rotationY).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('is inert while an object is being dragged (the drag turns it instead)', () => {
    transient.publishDrag({
      kind: 'move',
      id: DESK,
      x: 2,
      y: 0,
      z: 1.5,
      rotationY: 0,
      valid: true,
      wall: null,
    });
    press('r');
    expect(transform(DESK)?.rotationY).toBe(0);
  });

  it('skips stacked and locked objects but still turns the rest', () => {
    session.select([MONITOR, DESK], 'replace');
    press('r');
    expect(transform(MONITOR)?.rotationY).toBe(0); // on the desk: not a floor turn
    expect(transform(DESK)?.rotationY).toBeCloseTo(STEP);

    session.execute({
      type: 'test/lock',
      label: 'lock',
      apply(draft) {
        const target = draft.objects[DESK];
        if (target) target.locked = true;
      },
    });
    const before = transform(DESK)?.rotationY;
    press('r');
    expect(transform(DESK)?.rotationY).toBe(before);
  });

  it('stops listening on cleanup', () => {
    detach();
    press('r');
    expect(transform(DESK)?.rotationY).toBe(0);
  });
});

describe('attachRotateKeys: the step is the snap angle', () => {
  it('turns by the angle chosen in the session; Alt keeps the fine step', () => {
    session.setSnap({ angleStepDeg: 90 });
    press('r');
    expect(transform(DESK)?.rotationY).toBeCloseTo(Math.PI / 2);
    press('r', { altKey: true });
    expect(transform(DESK)?.rotationY).toBeCloseTo(Math.PI / 2 + Math.PI / 180);
  });
});
