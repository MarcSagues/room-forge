import { createEditorSession, type EditorSession, type SceneDocument } from '@roomforge/core';
import { buildDocument, buildRoom, createFixtureCatalog } from '@roomforge/core/testing';
import { Ray, Vector3 } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceController } from './place-controller';
import { createTransientStore, type TransientStore } from './transient-store';

// Fixture room 4 × 3 at the world origin; the desk (1.2 × 0.6) and the chair (0.6 × 0.6) stand on
// the floor. The document already holds desk-1 and monitor-1.
const DESK = 'desk.basic.120';
const CHAIR = 'chair.office';

/** A ray straight down onto the floor point (x, z). */
const down = (x: number, z: number) => new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0));
const away = () => new Ray(new Vector3(0, 10, 0), new Vector3(0, 1, 0));

let session: EditorSession;
let transient: TransientStore;
let invalidate: ReturnType<typeof vi.fn<() => void>>;
let controller: PlaceController;

function setup(document?: SceneDocument) {
  session = createEditorSession({
    initialDocument: document ?? buildDocument(),
    catalog: createFixtureCatalog(),
  });
  transient = createTransientStore();
  invalidate = vi.fn<() => void>();
  controller = new PlaceController({
    session,
    catalog: createFixtureCatalog(),
    transient,
    invalidate,
  });
}

const objects = () => Object.values(session.getState().document.objects);
const added = () =>
  objects().filter((object) => object.id !== 'desk-1' && object.id !== 'monitor-1');

beforeEach(() => setup());

describe('PlaceController: dragging an item over the floor', () => {
  it('shows a ghost of the item that follows the pointer on the grid, without touching the document', () => {
    const before = session.getState().document;
    expect(controller.begin(CHAIR)).toBe(true);
    expect(transient.ghost()).toMatchObject({ visible: false, w: 0.6, h: 1.1, d: 0.6 });
    controller.update(down(1.23, 1.58), false);
    expect(transient.ghost()).toMatchObject({ visible: true, valid: true, wall: null });
    expect(transient.ghost()?.x).toBeCloseTo(1.2);
    expect(transient.ghost()?.z).toBeCloseTo(1.6);
    expect(session.getState().document).toBe(before);
    expect(invalidate).toHaveBeenCalled();
  });

  it('carries the colour of the item for the ghost, when the catalog has one', () => {
    controller.begin(CHAIR);
    expect(transient.ghost()?.color).toBeNull();
    controller.cancel();
    const coloured = new PlaceController({
      session,
      catalog: {
        ...createFixtureCatalog(),
        colorOf: (id) => (id === CHAIR ? '#4a5568' : undefined),
      },
      transient,
      invalidate,
    });
    coloured.begin(CHAIR);
    expect(transient.ghost()?.color).toBe('#4a5568');
    coloured.begin(DESK);
    expect(transient.ghost()?.color).toBeNull();
  });

  it('snaps to a wall and turns to face the room', () => {
    controller.begin(DESK);
    controller.update(down(0.4, 1.5), false);
    expect(transient.ghost()?.wall).toBe('west');
    expect(transient.ghost()?.x).toBeCloseTo(0.3); // its back on the wall: half its depth
    expect(transient.ghost()?.rotationY).toBeCloseTo(Math.PI / 2);
  });

  it('Alt places freely, without grid or wall snap', () => {
    controller.begin(DESK);
    controller.update(down(1.237, 1.581), true);
    expect(transient.ghost()?.x).toBeCloseTo(1.237);
    expect(transient.ghost()?.z).toBeCloseTo(1.581);
    controller.update(down(0.65, 1.5), true);
    expect(transient.ghost()?.wall).toBeNull();
    expect(transient.ghost()?.rotationY).toBe(0);
  });

  it('hides the ghost when the pointer is not over a floor', () => {
    controller.begin(CHAIR);
    controller.update(down(1, 1), false);
    expect(transient.ghost()?.visible).toBe(true);
    controller.update(down(9, 9), false); // beyond the room
    expect(transient.ghost()?.visible).toBe(false);
    controller.update(null, false); // outside the viewport
    expect(transient.ghost()?.visible).toBe(false);
    controller.update(away(), false); // looking at the sky
    expect(transient.ghost()?.visible).toBe(false);
  });

  it('flags an item that does not fit the room as invalid', () => {
    session.execute({
      type: 'test/small',
      label: 'small',
      apply(draft) {
        const room = Object.values(draft.rooms)[0];
        if (room) room.shape.depth = 2;
      },
    });
    // Nothing is too large for the smallest room in this catalog: widen the item instead.
    const big = new PlaceController({
      session,
      catalog: {
        getItem: () => ({
          id: 'big',
          size: { w: 5, h: 1, d: 1 },
          placement: { surfaces: ['floor'] },
        }),
      },
      transient,
      invalidate,
    });
    big.begin('big');
    big.update(down(2, 1), false);
    expect(transient.ghost()).toMatchObject({ visible: true, valid: false });
    expect(big.end()).toBeNull();
    expect(added()).toHaveLength(0);
  });

  it('cannot start without a room', () => {
    setup({
      ...buildDocument(),
      rooms: {},
      roomOrder: [],
      objects: {},
      objectOrder: [],
      openings: {},
    });
    expect(controller.begin(CHAIR)).toBe(false);
    expect(transient.ghost()).toBeNull();
  });
});

describe('PlaceController: dropping', () => {
  it('creates the object where the ghost is, in one history entry, and selects it', () => {
    controller.begin(CHAIR);
    controller.update(down(1.23, 1.58), false);
    const result = controller.end();
    expect(result?.ok).toBe(true);
    const [chair] = added();
    expect(chair).toMatchObject({ catalogId: CHAIR, roomId: 'room-1', parentId: null });
    expect(chair?.transform.position[0]).toBeCloseTo(1.2);
    expect(chair?.transform.position[1]).toBe(0);
    expect(chair?.transform.position[2]).toBeCloseTo(1.6);
    expect(session.getState().history).toMatchObject({ canUndo: true, undoLabel: 'Add object' });
    expect(session.getState().selection).toEqual([chair?.id]);
    expect(transient.ghost()).toBeNull();

    session.undo();
    expect(added()).toHaveLength(0);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('keeps the turn of a wall snap', () => {
    controller.begin(DESK);
    controller.update(down(0.4, 1.5), false);
    controller.end();
    const [desk] = added();
    expect(desk?.transform.rotationY).toBeCloseTo(Math.PI / 2);
    expect(desk?.transform.position[0]).toBeCloseTo(0.3);
  });

  it('creates nothing when the ghost is hidden (outside the viewport or off the floor)', () => {
    controller.begin(CHAIR);
    controller.update(down(1, 1), false);
    controller.update(null, false);
    expect(controller.end()).toBeNull();
    expect(added()).toHaveLength(0);
    expect(session.getState().history.canUndo).toBe(false);
    expect(transient.ghost()).toBeNull();
  });

  it('creates nothing when no pointer position was ever seen', () => {
    controller.begin(CHAIR);
    expect(controller.end()).toBeNull();
    expect(added()).toHaveLength(0);
  });

  it('cancel creates nothing and removes the ghost', () => {
    controller.begin(CHAIR);
    controller.update(down(1, 1), false);
    controller.cancel();
    expect(added()).toHaveLength(0);
    expect(transient.ghost()).toBeNull();
    expect(controller.active).toBe(false);
  });

  it('a second drag starts from scratch', () => {
    controller.begin(CHAIR);
    controller.update(down(1, 1), false);
    controller.end();
    controller.begin(DESK);
    expect(transient.ghost()).toMatchObject({ visible: false, w: 1.2 });
    expect(controller.end()).toBeNull();
  });

  it("puts the object in the room under the pointer, in that room's coordinates", () => {
    const doc = buildDocument();
    doc.rooms['room-2' as never] = buildRoom({ id: 'room-2', origin: [10, 0] });
    (doc.roomOrder as string[]).push('room-2');
    setup(doc);
    controller.begin(CHAIR);
    controller.update(down(11.23, 1.58), false);
    expect(transient.ghost()?.x).toBeCloseTo(11.2); // world coordinates
    controller.end();
    const [chair] = added();
    expect(chair?.roomId).toBe('room-2');
    expect(chair?.transform.position[0]).toBeCloseTo(1.2); // room-local
  });
});

describe('PlaceController: placing in the middle of the view (click or Enter)', () => {
  it('uses the point of the floor at the centre of the view', () => {
    const result = controller.placeAtCenter(CHAIR, down(3.04, 0.97));
    expect(result?.ok).toBe(true);
    const [chair] = added();
    expect(chair?.transform.position[0]).toBeCloseTo(3);
    expect(chair?.transform.position[2]).toBeCloseTo(1);
    expect(session.getState().selection).toEqual([chair?.id]);
    expect(session.getState().history.undoLabel).toBe('Add object');
  });

  it('falls back to the middle of the room when the view does not look at a floor', () => {
    for (const ray of [null, away(), down(9, 9)]) {
      setup();
      expect(controller.placeAtCenter(CHAIR, ray)?.ok).toBe(true);
      const [chair] = added();
      expect(chair?.transform.position[0]).toBeCloseTo(2);
      expect(chair?.transform.position[2]).toBeCloseTo(1.5);
    }
  });

  it('does nothing without a room, and leaves no ghost behind', () => {
    setup({
      ...buildDocument(),
      rooms: {},
      roomOrder: [],
      objects: {},
      objectOrder: [],
      openings: {},
    });
    expect(controller.placeAtCenter(CHAIR, null)).toBeNull();
    expect(transient.ghost()).toBeNull();
  });

  it('is refused by the document when an item cannot fit', () => {
    const big = new PlaceController({
      session,
      catalog: {
        getItem: () => ({
          id: 'big',
          size: { w: 9, h: 1, d: 9 },
          placement: { surfaces: ['floor'] },
        }),
      },
      transient,
      invalidate,
    });
    expect(big.placeAtCenter('big', null)).toBeNull();
    expect(added()).toHaveLength(0);
  });
});

describe('PlaceController: snap settings from the session', () => {
  it('uses the grid size chosen in the session', () => {
    session.setSnap({ gridStep: 0.5 });
    controller.begin(CHAIR);
    controller.update(down(1.23, 1.58), false);
    expect(transient.ghost()?.x).toBeCloseTo(1);
    expect(transient.ghost()?.z).toBeCloseTo(1.5);
  });

  it('with snap off, places freely like holding Alt', () => {
    session.setSnap({ enabled: false });
    controller.begin(DESK);
    controller.update(down(0.65, 1.5), false);
    expect(transient.ghost()?.wall).toBeNull();
    expect(transient.ghost()?.rotationY).toBe(0);
  });
});

describe('PlaceController: on a desk top (P3-13)', () => {
  // desk-1's top: 1.2 × 0.6 m at 0.75 m, world x 1.4..2.6, z 1.2..1.8.
  const MONITOR = 'monitor.27';
  const STRIP = 'led.strip.1m';

  it('stands a tabletop item on the desk under the pointer, inside its top, as its child', () => {
    controller.begin(MONITOR);
    controller.update(down(2.33, 1.62), false);
    const ghost = transient.ghost();
    // 0.33 m right of centre: the 0.62 m monitor is pulled back onto the top, on the grid.
    expect(ghost).toMatchObject({ visible: true, valid: true, wall: null });
    expect(ghost?.x).toBeCloseTo(2.2);
    expect(ghost?.y).toBeCloseTo(0.75);
    expect(ghost?.z).toBeCloseTo(1.6);
    expect(controller.end()?.ok).toBe(true);
    const [monitor] = added();
    expect(monitor).toMatchObject({ catalogId: MONITOR, parentId: 'desk-1' });
    expect(monitor?.transform.position.map((v) => Number(v.toFixed(3)))).toEqual([0.2, 0.75, 0.1]);
    expect(session.getState().selection).toEqual([monitor?.id]);
    session.undo();
    expect(added()).toHaveLength(0);
  });

  it('follows the turn of the desk', () => {
    session.execute({
      type: 'test/turn',
      label: 'turn',
      apply(draft) {
        const desk = draft.objects['desk-1' as never];
        if (desk) desk.transform.rotationY = Math.PI / 2;
      },
    });
    controller.begin(STRIP);
    controller.update(down(2, 1.5), false);
    expect(transient.ghost()?.rotationY).toBeCloseTo(Math.PI / 2);
    controller.end();
    expect(added()[0]?.transform.rotationY).toBe(0);
  });

  it('puts an item that may also go on the floor on the floor beside the desk', () => {
    controller.begin(STRIP);
    controller.update(down(1, 2.5), false);
    expect(transient.ghost()?.y).toBe(0);
    controller.end();
    expect(added()[0]).toMatchObject({ parentId: null });
  });

  it('never puts a floor-only item on the desk', () => {
    controller.begin(CHAIR);
    controller.update(down(2, 1.5), false);
    expect(transient.ghost()).toMatchObject({ y: 0, valid: true });
    controller.end();
    expect(added()[0]).toMatchObject({ parentId: null });
  });

  it('refuses the floor to a tabletop-only item: the ghost turns red and nothing is created', () => {
    controller.begin(MONITOR);
    controller.update(down(1, 2.5), false);
    expect(transient.ghost()).toMatchObject({ visible: true, valid: false });
    expect(controller.end()).toBeNull();
    expect(added()).toHaveLength(0);
  });
});
