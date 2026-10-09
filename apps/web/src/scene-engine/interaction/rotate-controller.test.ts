import { createEditorSession, type EditorSession, type ObjectId } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { Object3D, Ray, Vector3 } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityRegistry, type EntityRegistry } from '../objects/entity-registry';
import { RotateController } from './rotate-controller';
import { createTransientStore, type TransientStore } from './transient-store';

// Fixture room 4 × 3 at the world origin; desk-1 (1.2 × 0.6) at (2, 0, 1.5) with monitor-1 on it.
const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;
const CENTRE = { x: 2, z: 1.5 };

/** A ray straight down onto the floor point (x, z). */
const down = (x: number, z: number) => new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0));
/** The floor point `distance` from the desk centre in the direction `angle` (0 = +z, π/2 = +x). */
const around = (angle: number, distance = 1) =>
  down(CENTRE.x + Math.sin(angle) * distance, CENTRE.z + Math.cos(angle) * distance);

let session: EditorSession;
let registry: EntityRegistry;
let transient: TransientStore;
let invalidate: ReturnType<typeof vi.fn<() => void>>;
let controller: RotateController;
let desk: Object3D;

/** Moves the desk (document and Object3D) to `z`, keeping x. */
function placeDesk(z: number) {
  session.execute({
    type: 'test/place',
    label: 'place',
    apply(draft) {
      const target = draft.objects[DESK];
      if (target) target.transform.position = [CENTRE.x, 0, z];
    },
  });
  desk.position.set(CENTRE.x, 0, z);
}

/** Makes the desk 2.4 wide: turned a quarter it is 2.4 deep, more than the smallest room. */
function widenDesk() {
  session.execute({
    type: 'test/widen',
    label: 'widen',
    apply(draft) {
      const target = draft.objects[DESK];
      if (target) target.transform.scale = [2, 1, 1];
    },
  });
}

const shrinkRoomDepth = (depth: number) =>
  session.execute({
    type: 'test/shrink',
    label: 'shrink',
    apply(draft) {
      const room = Object.values(draft.rooms)[0];
      if (room) room.shape.depth = depth;
    },
  });

const rotationOf = (id: ObjectId) => session.getState().document.objects[id]?.transform.rotationY;

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  registry = createEntityRegistry();
  for (const object of Object.values(session.getState().document.objects)) {
    const node = new Object3D();
    node.position.fromArray(object.transform.position);
    node.rotation.y = object.transform.rotationY;
    registry.register(object.id, node);
  }
  transient = createTransientStore();
  invalidate = vi.fn<() => void>();
  desk = registry.get(DESK) as Object3D;
  controller = new RotateController({
    session,
    catalog: createFixtureCatalog(),
    registry,
    transient,
    invalidate,
  });
});

describe('RotateController', () => {
  it('turns the Object3D to follow the pointer around the centre, snapped to 15°', () => {
    const before = session.getState().document;
    expect(controller.begin(DESK, around(0))).toBe(true); // grabbed on its front
    controller.update(around(Math.PI / 2 + 0.05), false);
    expect(desk.rotation.y).toBeCloseTo(Math.PI / 2);
    controller.update(around(0.3), false); // 17.2° → 15°
    expect(desk.rotation.y).toBeCloseTo(Math.PI / 12);
    expect(desk.position.toArray()).toEqual([2, 0, 1.5]);
    expect(session.getState().document).toBe(before); // nothing written until release
    expect(transient.drag()).toMatchObject({ kind: 'rotate', id: DESK, valid: true });
    expect(invalidate).toHaveBeenCalled();
  });

  it('begin publishes the pose at once, so the camera is locked before the first move', () => {
    controller.begin(DESK, around(0));
    expect(transient.drag()).toMatchObject({
      kind: 'rotate',
      id: DESK,
      x: 2,
      z: 1.5,
      rotationY: 0,
    });
    controller.cancel();
    expect(transient.drag()).toBeNull();
  });

  it('keeps the grabbed point under the pointer instead of jumping to it', () => {
    controller.begin(DESK, around(0.5)); // grabbed 28.6° off the front
    controller.update(around(0.5 + Math.PI / 2), false);
    expect(desk.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });

  it('Alt turns freely, without the angle step', () => {
    controller.begin(DESK, around(0));
    controller.update(around(0.3), true);
    expect(desk.rotation.y).toBeCloseTo(0.3);
  });

  it('commits one command on release; undo restores the orientation', () => {
    controller.begin(DESK, around(0));
    for (let angle = 0.1; angle <= Math.PI / 2 + 0.05; angle += 0.1) {
      controller.update(around(angle), false);
    }
    const result = controller.end();
    expect(result?.ok).toBe(true);
    expect(rotationOf(DESK)).toBeCloseTo(Math.PI / 2);
    expect(session.getState().history).toMatchObject({ canUndo: true, undoLabel: 'Rotate object' });
    expect(transient.drag()).toBeNull();

    session.undo();
    expect(rotationOf(DESK)).toBe(0);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('Esc (cancel) puts the orientation back and records nothing', () => {
    controller.begin(DESK, around(0));
    controller.update(around(1.2), false);
    controller.cancel();
    expect(desk.rotation.y).toBe(0);
    expect(session.getState().history.canUndo).toBe(false);
    expect(transient.drag()).toBeNull();
    expect(controller.active).toBe(false);
  });

  it('a press without turning records nothing', () => {
    controller.begin(DESK, around(0));
    controller.update(around(0.02), false); // still snaps to 0°
    expect(controller.end()).toBeNull();
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('pushes the object off a wall it would cross when turned, in the same entry', () => {
    // Put the desk against the south wall (depth 3): a quarter turn makes it 1.2 deep.
    placeDesk(2.7);
    controller.begin(DESK, down(2, 3.7));
    controller.update(down(3.7, 2.7), false);
    expect(desk.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(desk.position.z).toBeCloseTo(3 - 0.6);
    controller.end();
    expect(session.getState().document.objects[DESK]?.transform.position[2]).toBeCloseTo(2.4);
    const entries = session.getState().history;
    session.undo();
    expect(session.getState().document.objects[DESK]?.transform.position[2]).toBeCloseTo(2.7);
    expect(entries.undoLabel).toBeTruthy();
  });

  it('blocks a turn that cannot fit in the room and flags it as invalid', () => {
    widenDesk();
    expect(shrinkRoomDepth(2).ok).toBe(true);
    controller.begin(DESK, around(0));
    controller.update(around(Math.PI / 2), false); // a quarter turn: 2.4 deep in a room 2 deep
    expect(transient.drag()?.valid).toBe(false);
    expect(desk.rotation.y).toBe(0); // the object stays as it was
    expect(controller.end()).toBeNull();
    expect(rotationOf(DESK)).toBe(0);
  });

  it('only turns objects standing on a room, never stacked or locked ones', () => {
    expect(controller.begin(MONITOR, around(0))).toBe(false);
    expect(controller.begin('nope' as ObjectId, around(0))).toBe(false);
    session.execute({
      type: 'test/lock',
      label: 'lock',
      apply(draft) {
        const target = draft.objects[DESK];
        if (target) target.locked = true;
      },
    });
    expect(controller.begin(DESK, around(0))).toBe(false);
  });

  it('ignores rays that do not reach the floor', () => {
    controller.begin(DESK, around(0));
    controller.update(new Ray(new Vector3(0, 10, 0), new Vector3(0, 1, 0)), false);
    expect(desk.rotation.y).toBe(0);
  });

  it('restores the Object3D if the command is rejected at drop', () => {
    widenDesk();
    controller.begin(DESK, around(0));
    controller.update(around(Math.PI / 2), false); // fits for now: the room is 3 deep
    expect(transient.drag()?.valid).toBe(true);
    expect(shrinkRoomDepth(2).ok).toBe(true); // the document still fits: unturned it is 0.6 deep
    expect(controller.end()?.ok).toBe(false);
    expect(desk.rotation.y).toBe(0);
    expect(desk.position.z).toBeCloseTo(1.5);
  });
});
