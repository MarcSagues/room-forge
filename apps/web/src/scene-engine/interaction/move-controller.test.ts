import {
  createEditorSession,
  type EditorSession,
  type ObjectId,
  type SceneDocument,
} from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { Object3D, Ray, Vector3 } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityRegistry, type EntityRegistry } from '../objects/entity-registry';
import { MoveController } from './move-controller';
import { createTransientStore, type TransientStore } from './transient-store';

// Fixture room 4 × 3 at the world origin; desk-1 (1.2 × 0.6) at (2, 0, 1.5) with monitor-1 on it.
const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;

/** A ray straight down onto the floor point (x, z). */
const down = (x: number, z: number) => new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0));

let session: EditorSession;
let registry: EntityRegistry;
let transient: TransientStore;
let invalidate: ReturnType<typeof vi.fn<() => void>>;
let controller: MoveController;
let desk: Object3D;

function mountObjects(doc: SceneDocument) {
  for (const object of Object.values(doc.objects)) {
    const node = new Object3D();
    node.position.fromArray(object.transform.position);
    node.rotation.y = object.transform.rotationY;
    registry.register(object.id, node);
  }
}

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  registry = createEntityRegistry();
  transient = createTransientStore();
  invalidate = vi.fn<() => void>();
  mountObjects(session.getState().document as SceneDocument);
  desk = registry.get(DESK) as Object3D;
  controller = new MoveController({
    session,
    catalog: createFixtureCatalog(),
    registry,
    transient,
    invalidate,
    gridStep: 0.1,
  });
});

describe('MoveController', () => {
  it('moves the Object3D while dragging, keeping the grab offset, without touching the document', () => {
    const before = session.getState().document;
    expect(controller.begin(DESK, down(2.2, 1.5))).toBe(true); // grabbed 20 cm right of centre
    controller.update(down(2.72, 1.5), false);
    expect(desk.position.x).toBeCloseTo(2.5); // 2.52 snapped to the 10 cm grid
    expect(desk.position.z).toBeCloseTo(1.5);
    expect(session.getState().document).toBe(before);
    expect(transient.drag()).toMatchObject({ id: DESK, x: desk.position.x, z: 1.5, valid: true });
    expect(invalidate).toHaveBeenCalled();
  });

  it('commits one object/move on release; undo returns the object', () => {
    controller.begin(DESK, down(2, 1.5));
    for (let x = 2.05; x <= 2.6; x += 0.05) controller.update(down(x, 1.5), false);
    const result = controller.end();
    expect(result?.ok).toBe(true);
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBeCloseTo(2.6);
    expect(session.getState().history).toMatchObject({ canUndo: true, undoLabel: 'Move object' });
    expect(transient.drag()).toBeNull();

    session.undo();
    expect(session.getState().document.objects[DESK]?.transform.position).toEqual([2, 0, 1.5]);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('Esc (cancel) restores the pose without a history entry', () => {
    controller.begin(DESK, down(2, 1.5));
    controller.update(down(3, 2), false);
    controller.cancel();
    expect(desk.position.toArray()).toEqual([2, 0, 1.5]);
    expect(session.getState().history.canUndo).toBe(false);
    expect(transient.drag()).toBeNull();
    expect(controller.active).toBe(false);
  });

  it('a press without movement records nothing', () => {
    controller.begin(DESK, down(2, 1.5));
    expect(controller.end()).toBeNull();
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('keeps the object inside the room and snaps to a wall, turning it, in one entry', () => {
    controller.begin(DESK, down(2, 1.5));
    controller.update(down(-3, 1.5), false); // far past the west wall
    expect(desk.position.x).toBeCloseTo(0.3); // back face on the wall: half its depth
    expect(desk.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(transient.drag()?.wall).toBe('west');
    controller.end();
    const moved = session.getState().document.objects[DESK]?.transform;
    expect(moved?.rotationY).toBeCloseTo(Math.PI / 2);
    session.undo();
    expect(session.getState().document.objects[DESK]?.transform.rotationY).toBe(0);
  });

  it('leaving the wall restores the original orientation', () => {
    controller.begin(DESK, down(2, 1.5));
    controller.update(down(-3, 1.5), false);
    controller.update(down(2, 1.5), false);
    expect(desk.rotation.y).toBeCloseTo(0);
  });

  it('Alt moves freely: no grid and no wall snap', () => {
    controller.begin(DESK, down(2, 1.5));
    controller.update(down(2.537, 1.5), true);
    expect(desk.position.x).toBeCloseTo(2.537);
    controller.update(down(0.65, 1.5), true); // 5 cm from the wall: no snap with Alt
    expect(desk.rotation.y).toBe(0);
    expect(desk.position.x).toBeCloseTo(0.65);
  });

  it('only drags objects standing on a room, never stacked or locked ones', () => {
    expect(controller.begin(MONITOR, down(2, 1.5))).toBe(false);
    expect(controller.begin('nope' as ObjectId, down(2, 1.5))).toBe(false);
    session.execute({
      type: 'test/lock',
      label: 'lock',
      apply(draft) {
        const target = draft.objects[DESK];
        if (target) target.locked = true;
      },
    });
    expect(controller.begin(DESK, down(2, 1.5))).toBe(false);
  });

  it('ignores rays that do not reach the floor', () => {
    controller.begin(DESK, down(2, 1.5));
    controller.update(new Ray(new Vector3(0, 10, 0), new Vector3(0, 1, 0)), false);
    expect(desk.position.toArray()).toEqual([2, 0, 1.5]);
  });

  it('restores the Object3D if the command is rejected at drop', () => {
    controller.begin(DESK, down(2, 1.5));
    controller.update(down(2.5, 1.5), false);
    // Something changed the room meanwhile so that the drop is illegal.
    session.execute({
      type: 'test/shrink',
      label: 'shrink',
      apply(draft) {
        const room = Object.values(draft.rooms)[0];
        if (room) room.shape.width = 2.6;
      },
    });
    const result = controller.end();
    expect(result?.ok).toBe(false);
    expect(desk.position.x).toBe(2);
  });
});
