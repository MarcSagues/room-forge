import {
  addOpening,
  createEditorSession,
  type EditorSession,
  type OpeningId,
  type RoomId,
} from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { Object3D, Ray, Vector3 } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityRegistry, type EntityRegistry } from '../objects/entity-registry';
import { WALL_THICKNESS } from '../room/room-geometry';
import { OpeningController } from './opening-controller';
import { createTransientStore, type TransientStore } from './transient-store';

// Fixture room 4 × 3 × 2.6 at the world origin; window-1 (0.9 wide) on the north wall at 0.5.
const WINDOW = 'window-1' as OpeningId;

/** From inside the room, looking straight at the north wall, at `x`. */
const atNorth = (x: number) => new Ray(new Vector3(x, 1.5, 2), new Vector3(0, 0, -1));
/** Straight down onto the floor point (x, z), as in the plan view. */
const down = (x: number, z: number) => new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0));

let session: EditorSession;
let registry: EntityRegistry;
let transient: TransientStore;
let invalidate: ReturnType<typeof vi.fn<() => void>>;
let controller: OpeningController;
let anchor: Object3D;

const anchorX = (offset: number) => WALL_THICKNESS + offset + 0.45;
const offsetOf = (id: OpeningId) => session.getState().document.openings[id]?.offset;

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  registry = createEntityRegistry();
  transient = createTransientStore();
  invalidate = vi.fn<() => void>();
  anchor = new Object3D();
  anchor.position.x = anchorX(0.5);
  registry.register(WINDOW, anchor);
  controller = new OpeningController({ session, registry, transient, invalidate });
});

describe('OpeningController', () => {
  it('slides the anchor along the wall, keeping the grab offset, without touching the document', () => {
    const before = session.getState().document;
    expect(controller.begin(WINDOW, atNorth(0.9))).toBe(true); // grabbed 40 cm into the window
    expect(transient.opening()).toMatchObject({ id: WINDOW, wall: 'north', offset: 0.5 });
    controller.update(atNorth(2.03), false);
    // 2.03 − 0.4 = 1.63, on the 10 cm grid → 1.6.
    expect(anchor.position.x).toBeCloseTo(anchorX(1.6));
    expect(transient.opening()).toMatchObject({ offset: expect.closeTo(1.6), valid: true });
    expect(session.getState().document).toBe(before);
    expect(invalidate).toHaveBeenCalled();
  });

  it('commits one opening/move on release: one undo puts it back', () => {
    controller.begin(WINDOW, atNorth(0.9));
    controller.update(atNorth(1.5), false);
    controller.update(atNorth(2.03), false);
    expect(controller.end()?.ok).toBe(true);
    expect(offsetOf(WINDOW)).toBeCloseTo(1.6);
    expect(transient.opening()).toBeNull();
    expect(session.getState().history.undoLabel).toBe('Move opening');
    session.undo();
    expect(offsetOf(WINDOW)).toBe(0.5);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('records nothing for a press without movement', () => {
    controller.begin(WINDOW, atNorth(0.9));
    controller.update(atNorth(0.9), false);
    expect(controller.end()).toBeNull();
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('Esc puts it back and records nothing', () => {
    controller.begin(WINDOW, atNorth(0.9));
    controller.update(atNorth(2.5), false);
    controller.cancel();
    expect(anchor.position.x).toBeCloseTo(anchorX(0.5));
    expect(offsetOf(WINDOW)).toBe(0.5);
    expect(transient.opening()).toBeNull();
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('stays clear of the corners and off the grid with Alt', () => {
    controller.begin(WINDOW, atNorth(0.9));
    controller.update(atNorth(-3), false);
    expect(transient.opening()?.offset).toBeCloseTo(0.1);
    controller.update(atNorth(2.03), true);
    expect(transient.opening()?.offset).toBeCloseTo(1.63);
  });

  it('flags an overlap with another opening, and refuses the drop', () => {
    const roomId = 'room-1' as RoomId;
    session.execute(
      addOpening({ id: 'w2', roomId, wall: 'north', variant: 'window.standard', offset: 2.5 }),
    );
    controller.begin(WINDOW, atNorth(0.9));
    controller.update(atNorth(2.6), false); // 2.2 .. 3.1 overlaps 2.5 .. 3.5
    expect(transient.opening()?.valid).toBe(false);
    expect(controller.end()).toBeNull();
    expect(offsetOf(WINDOW)).toBe(0.5);
    expect(anchor.position.x).toBeCloseTo(anchorX(0.5));
  });

  it('works from the plan view, where the ray runs along the wall', () => {
    expect(controller.begin(WINDOW, down(0.9, 0.05))).toBe(true);
    controller.update(down(2.03, 0.05), false);
    expect(transient.opening()?.offset).toBeCloseTo(1.6);
  });

  it('refuses unknown openings and openings without an anchor', () => {
    expect(controller.begin('nope' as OpeningId, atNorth(1))).toBe(false);
    expect(controller.begin('door-1' as OpeningId, atNorth(1))).toBe(false);
    expect(controller.active).toBe(false);
  });
});
