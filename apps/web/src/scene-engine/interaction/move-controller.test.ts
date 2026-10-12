import {
  addObject,
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

  it('never drags unknown or locked objects', () => {
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

  it('begin publishes the pose at once, so the camera is locked before the first move', () => {
    controller.begin(DESK, down(2, 1.5));
    expect(transient.drag()).toMatchObject({ kind: 'move', id: DESK, x: 2, z: 1.5 });
    controller.cancel();
    expect(transient.drag()).toBeNull();
  });

  describe('turning while dragging (wheel or R)', () => {
    const step = Math.PI / 12;

    it('turns the object in place, without moving the pointer, in the same entry', () => {
      controller.begin(DESK, down(2, 1.5));
      controller.update(down(2.5, 1.5), false);
      controller.turnBy(1, 15);
      expect(desk.rotation.y).toBeCloseTo(step);
      expect(desk.position.x).toBeCloseTo(2.5);
      controller.turnBy(2, 15);
      expect(desk.rotation.y).toBeCloseTo(3 * step);
      expect(transient.drag()?.rotationY).toBeCloseTo(3 * step);

      controller.end();
      expect(session.getState().document.objects[DESK]?.transform.rotationY).toBeCloseTo(3 * step);
      session.undo();
      expect(session.getState().document.objects[DESK]?.transform).toMatchObject({
        position: [2, 0, 1.5],
        rotationY: 0,
      });
      expect(session.getState().history.canUndo).toBe(false);
    });

    it('keeps the turn while the pointer keeps moving, and Shift+R / negative steps undo it', () => {
      controller.begin(DESK, down(2, 1.5));
      controller.turnBy(2, 15);
      controller.update(down(2.3, 1.7), false);
      expect(desk.rotation.y).toBeCloseTo(2 * step);
      controller.turnBy(-2, 15);
      expect(desk.rotation.y).toBeCloseTo(0);
    });

    it('the fine step is whatever step it is given', () => {
      controller.begin(DESK, down(2, 1.5));
      controller.update(down(2.2, 1.5), true);
      controller.turnBy(1, 1);
      expect(desk.rotation.y).toBeCloseTo(Math.PI / 180);
    });

    it('keeps the turned footprint inside the room', () => {
      controller.begin(DESK, down(2, 1.5));
      controller.update(down(2, 2.7), false); // against the south wall: pushed to z = 2.7
      controller.update(down(2, 2.4), true); // free: 0.6 from the wall, 1.2 wide
      controller.turnBy(6, 15); // a quarter turn would need 0.6 each side, in z
      expect(desk.rotation.y).toBeCloseTo(Math.PI / 2);
      expect(desk.position.z).toBeLessThanOrEqual(3 - 0.6 + 1e-9);
    });

    it('a wall snap sets the orientation: the turn does not override it', () => {
      controller.begin(DESK, down(2, 1.5));
      controller.update(down(-3, 1.5), false); // snapped to the west wall
      const snapped = desk.rotation.y;
      controller.turnBy(3, 15);
      expect(desk.rotation.y).toBeCloseTo(snapped);
      controller.update(down(2, 1.5), false); // back in the open: the turn applies
      expect(desk.rotation.y).toBeCloseTo(3 * step);
    });

    it('a new drag starts without the previous turn', () => {
      controller.begin(DESK, down(2, 1.5));
      controller.turnBy(4, 15);
      controller.cancel();
      controller.begin(DESK, down(2, 1.5));
      controller.update(down(2.3, 1.5), false);
      expect(desk.rotation.y).toBeCloseTo(0);
    });

    it('turning before the pointer has moved waits for the first move', () => {
      controller.begin(DESK, down(2, 1.5));
      controller.turnBy(1, 15);
      expect(desk.rotation.y).toBe(0);
      controller.update(down(2, 1.5), false);
      expect(desk.rotation.y).toBeCloseTo(step);
    });
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

describe('MoveController: snap settings from the session', () => {
  it('uses the grid size chosen in the session', () => {
    session.setSnap({ gridStep: 0.25 });
    controller.begin(DESK, down(2.2, 1.5));
    controller.update(down(2.62, 1.5), false); // wants 2.42
    expect(desk.position.x).toBeCloseTo(2.5);
  });

  it('with snap off, moves freely: no grid and no wall snap, like holding Alt', () => {
    session.setSnap({ enabled: false });
    controller.begin(DESK, down(2.2, 1.5));
    controller.update(down(2.72, 1.5), false);
    expect(desk.position.x).toBeCloseTo(2.52);
    controller.update(down(-3, 1.5), false);
    expect(desk.position.x).toBeCloseTo(0.6); // kept inside, but not turned against the wall
    expect(desk.rotation.y).toBe(0);
    expect(transient.drag()?.wall ?? null).toBeNull();
  });
});

describe('MoveController: objects on a desk top (P3-13)', () => {
  // The fixture desk top is 1.2 × 0.6 m at 0.75 m: world x 1.4..2.6, z 1.2..1.8. monitor-1 stands
  // on it at (0, 0.75, -0.2), world (2, 0.75, 1.3); the fixture monitor only goes on tabletops.
  const STRIP = 'strip' as ObjectId;
  const doc = () => session.getState().document;

  /** Adds an LED strip (floor or tabletop) and a chair (floor only) on the floor, then mounts all. */
  function withFloorItems() {
    session.execute(
      addObject({
        id: 'strip',
        catalogId: 'led.strip.1m',
        roomId: doc().roomOrder[0] as never,
        position: [0.8, 0, 0.5],
        rotationY: 0,
      }),
    );
    session.execute(
      addObject({
        id: 'chair',
        catalogId: 'chair.office',
        roomId: doc().roomOrder[0] as never,
        position: [3, 0, 0.5],
        rotationY: 0,
      }),
    );
    mountObjects(doc() as SceneDocument);
  }

  it('slides a child along its desk top, clamped on it, with one object/move', () => {
    const monitor = registry.get(MONITOR) as Object3D;
    expect(controller.begin(MONITOR, down(2, 1.3))).toBe(true);
    controller.update(down(2.5, 1.3), false);
    // 0.5 m right of centre, but the 0.62 m monitor must stay on the top (and on the 10 cm grid).
    expect(monitor.position.x).toBeCloseTo(0.2);
    expect(monitor.position.y).toBeCloseTo(0.75);
    expect(transient.drag()).toMatchObject({ id: MONITOR, valid: true });
    expect(controller.end()?.ok).toBe(true);
    expect(doc().objects[MONITOR]).toMatchObject({ parentId: DESK });
    expect(doc().objects[MONITOR]?.transform.position[0]).toBeCloseTo(0.2);
    expect(session.getState().history.undoLabel).toBe('Move object');
  });

  it('puts a floor object on the desk as its child, in one entry that undo takes back', () => {
    withFloorItems();
    expect(controller.begin(STRIP, down(0.8, 0.5))).toBe(true);
    controller.update(down(1.5, 1), false);
    controller.update(down(2.2, 1.6), false);
    const strip = registry.get(STRIP) as Object3D;
    // Hanging from the room still, the node is shown on the top: 1 m long, so x is clamped to 0.1.
    expect(strip.position.toArray().map((v) => Number(v.toFixed(3)))).toEqual([2.1, 0.75, 1.6]);
    expect(controller.end()?.ok).toBe(true);
    expect(doc().objects[STRIP]).toMatchObject({ parentId: DESK });
    const [x, y, z] = doc().objects[STRIP]?.transform.position ?? [];
    expect([x, y, z].map((v) => Number(v?.toFixed(3)))).toEqual([0.1, 0.75, 0.1]);
    session.undo();
    expect(doc().objects[STRIP]).toMatchObject({
      parentId: null,
      transform: { position: [0.8, 0, 0.5] },
    });
  });

  it('takes a child off the desk to the floor in one entry, when it may stand on the floor', () => {
    withFloorItems();
    controller.begin(STRIP, down(0.8, 0.5));
    controller.update(down(2.2, 1.6), false);
    controller.end();
    mountObjects(doc() as SceneDocument);
    controller.begin(STRIP, down(2.1, 1.6));
    controller.update(down(1, 2.5), false);
    expect(controller.end()?.ok).toBe(true);
    expect(doc().objects[STRIP]).toMatchObject({
      parentId: null,
      transform: { position: [1, 0, 2.5] },
    });
    session.undo();
    expect(doc().objects[STRIP]?.parentId).toBe(DESK);
  });

  it('refuses the floor to an item that only goes on tabletops: red, and nothing on release', () => {
    const before = doc();
    controller.begin(MONITOR, down(2, 1.3));
    controller.update(down(1, 2.5), false);
    expect(transient.drag()?.valid).toBe(false);
    expect(controller.end()).toBeNull();
    expect(doc()).toBe(before);
    expect((registry.get(MONITOR) as Object3D).position.toArray()).toEqual([0, 0.75, -0.2]);
  });

  it('never puts a floor-only item on the desk', () => {
    withFloorItems();
    controller.begin('chair' as ObjectId, down(3, 0.5));
    controller.update(down(2, 1.5), false);
    controller.end();
    expect(doc().objects['chair' as ObjectId]).toMatchObject({
      parentId: null,
      transform: { position: [2, 0, 1.5] },
    });
  });

  it('dragging the desk leaves its children where they are on it', () => {
    controller.begin(DESK, down(2, 1.5));
    controller.update(down(1, 1), false);
    controller.end();
    expect(doc().objects[DESK]?.transform.position).toEqual([1, 0, 1]);
    expect(doc().objects[MONITOR]).toMatchObject({
      parentId: DESK,
      transform: { position: [0, 0.75, -0.2] },
    });
  });

  it('Esc puts a child back on its desk', () => {
    withFloorItems();
    controller.begin(MONITOR, down(2, 1.3));
    controller.update(down(2.3, 1.5), false);
    controller.cancel();
    expect((registry.get(MONITOR) as Object3D).position.toArray()).toEqual([0, 0.75, -0.2]);
    expect(session.getState().history.undoLabel).not.toBe('Move object');
  });
});
