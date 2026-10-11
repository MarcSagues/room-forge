import {
  createEditorSession,
  DEFAULT_SNAP,
  type EditorSession,
  type ObjectId,
} from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attachNudge } from './nudge-controller';
import { createTransientStore, type TransientStore } from './transient-store';

const NUDGE_STEP = DEFAULT_SNAP.gridStep;

// Fixture room 4 × 3 at the world origin; desk-1 (1.2 × 0.6) at (2, 0, 1.5) with monitor-1 on it.
const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;

let session: EditorSession;
let transient: TransientStore;
let detach: () => void;
let keyTarget: EventTarget;

const position = (id: ObjectId) => session.getState().document.objects[id]?.transform.position;

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = keyTarget) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  transient = createTransientStore();
  keyTarget = new EventTarget();
  detach = attachNudge({
    session,
    catalog: createFixtureCatalog(),
    transient,
    keyTarget: keyTarget as unknown as Window,
  });
  session.select([DESK], 'replace');
});

describe('attachNudge', () => {
  it('moves the selected object one step per arrow, along the room axes', () => {
    press('ArrowRight');
    expect(position(DESK)?.[0]).toBeCloseTo(2 + NUDGE_STEP);
    press('ArrowDown');
    expect(position(DESK)?.[2]).toBeCloseTo(1.5 + NUDGE_STEP);
    press('ArrowLeft');
    press('ArrowUp');
    expect(position(DESK)).toEqual([2, 0, 1.5].map((value) => expect.closeTo(value)));
  });

  it('Shift moves ten steps', () => {
    press('ArrowLeft', { shiftKey: true });
    expect(position(DESK)?.[0]).toBeCloseTo(2 - NUDGE_STEP * 10);
  });

  it('keeps the object inside the room', () => {
    for (let i = 0; i < 5; i += 1) press('ArrowRight', { shiftKey: true });
    // Room 4 m wide, desk 1.2 m wide: its centre stops 0.6 m from the east wall.
    expect(position(DESK)?.[0]).toBeCloseTo(3.4);
    const before = session.getState().history;
    press('ArrowRight'); // already against the wall: nothing to do
    expect(session.getState().history).toEqual(before);
  });

  it('holding an arrow is one undo step', () => {
    for (let i = 0; i < 4; i += 1) press('ArrowRight', { repeat: i > 0 });
    expect(position(DESK)?.[0]).toBeCloseTo(2.4);
    session.undo();
    expect(position(DESK)).toEqual([2, 0, 1.5]);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('claims the key so the page does not scroll', () => {
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(press('a').defaultPrevented).toBe(false);
  });

  it('does nothing without a selection, or with a modifier that belongs to the browser', () => {
    press('ArrowRight', { ctrlKey: true });
    press('ArrowRight', { metaKey: true });
    press('ArrowRight', { altKey: true });
    expect(position(DESK)).toEqual([2, 0, 1.5]);
    session.select([]);
    press('ArrowRight');
    expect(position(DESK)).toEqual([2, 0, 1.5]);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('leaves arrows to text fields', () => {
    detach();
    detach = attachNudge({
      session,
      catalog: createFixtureCatalog(),
      transient,
      keyTarget: window,
    });
    const input = document.body.appendChild(document.createElement('input'));
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    input.remove();
    expect(position(DESK)).toEqual([2, 0, 1.5]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('is inert while an object is being dragged', () => {
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
    press('ArrowRight');
    expect(position(DESK)).toEqual([2, 0, 1.5]);
  });

  it('skips stacked and locked objects but still moves the rest', () => {
    session.select([MONITOR, DESK], 'replace');
    press('ArrowRight');
    expect(position(MONITOR)).toEqual([0, 0.75, -0.2]); // on the desk: not a floor move
    expect(position(DESK)?.[0]).toBeCloseTo(2 + NUDGE_STEP);

    session.execute({
      type: 'test/lock',
      label: 'lock',
      apply(draft) {
        const target = draft.objects[DESK];
        if (target) target.locked = true;
      },
    });
    const before = position(DESK);
    press('ArrowRight');
    expect(position(DESK)).toEqual(before);
  });

  it('stops listening on cleanup', () => {
    detach();
    press('ArrowRight');
    expect(position(DESK)).toEqual([2, 0, 1.5]);
  });
});

describe('attachNudge: the step is the snap grid size', () => {
  it('moves by the grid size chosen in the session, on or off', () => {
    session.setSnap({ gridStep: 0.25 });
    press('ArrowRight');
    expect(position(DESK)?.[0]).toBeCloseTo(2.25);
    session.setSnap({ enabled: false, gridStep: 0.05 });
    press('ArrowRight');
    expect(position(DESK)?.[0]).toBeCloseTo(2.3);
  });
});
