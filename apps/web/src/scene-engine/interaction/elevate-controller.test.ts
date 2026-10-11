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
import { ElevateController } from './elevate-controller';
import { createTransientStore, type TransientStore } from './transient-store';

// Fixture room 4 × 3 × 2.6 at the world origin; desk-1 (75 cm tall) at (2, 0, 1.5) with
// monitor-1 standing on it. Its elevation goes from 0 to 1.85 m.
const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;

/** A horizontal ray from the south, looking north, at height `y`: it hits the desk's plane. */
const level = (y: number) => new Ray(new Vector3(2, y, 10), new Vector3(0, 0, -1));
const down = new Ray(new Vector3(2, 10, 1.5), new Vector3(0, -1, 0));

let session: EditorSession;
let registry: EntityRegistry;
let transient: TransientStore;
let invalidate: ReturnType<typeof vi.fn<() => void>>;
let controller: ElevateController;
let desk: Object3D;

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  registry = createEntityRegistry();
  for (const object of Object.values((session.getState().document as SceneDocument).objects)) {
    const node = new Object3D();
    node.position.fromArray(object.transform.position);
    registry.register(object.id, node);
  }
  desk = registry.get(DESK) as Object3D;
  transient = createTransientStore();
  invalidate = vi.fn<() => void>();
  controller = new ElevateController({
    session,
    catalog: createFixtureCatalog(),
    registry,
    transient,
    invalidate,
  });
});

const elevation = () => session.getState().document.objects[DESK]?.transform.position[1];

describe('ElevateController', () => {
  it('lifts the Object3D with the pointer, on the grid, without touching the document', () => {
    const before = session.getState().document;
    expect(controller.begin(DESK, level(0.4))).toBe(true); // grabbed 40 cm above the base
    expect(transient.drag()).toMatchObject({ kind: 'elevate', id: DESK, y: 0 });
    controller.update(level(1.23), false);
    expect(desk.position.y).toBeCloseTo(0.8); // 0.83 on the 10 cm grid
    expect(transient.drag()?.y).toBeCloseTo(0.8);
    expect(session.getState().document).toBe(before);
    expect(invalidate).toHaveBeenCalled();
  });

  it('Alt lifts freely, and the floor and the ceiling stop it', () => {
    controller.begin(DESK, level(0.4));
    controller.update(level(1.23), true);
    expect(desk.position.y).toBeCloseTo(0.83);
    controller.update(level(9), false);
    expect(desk.position.y).toBeCloseTo(1.85);
    controller.update(level(-3), false);
    expect(desk.position.y).toBe(0);
  });

  it('commits one object/setElevation on release; undo brings it down', () => {
    controller.begin(DESK, level(0.4));
    for (const y of [0.5, 0.8, 1.1, 1.4]) controller.update(level(y), false);
    expect(controller.end()?.ok).toBe(true);
    expect(elevation()).toBeCloseTo(1);
    expect(session.getState().history).toMatchObject({ undoLabel: 'Change elevation' });
    expect(transient.drag()).toBeNull();
    session.undo();
    expect(elevation()).toBe(0);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('Esc (cancel) puts it back without a history entry; a still press records nothing', () => {
    controller.begin(DESK, level(0.4));
    controller.update(level(1.4), false);
    controller.cancel();
    expect(desk.position.y).toBe(0);
    expect(session.getState().history.canUndo).toBe(false);
    controller.begin(DESK, level(0.4));
    expect(controller.end()).toBeNull();
  });

  it('refuses stacked and locked objects, and the view from straight above', () => {
    expect(controller.begin(MONITOR, level(1))).toBe(false);
    expect(controller.begin(DESK, down)).toBe(false);
    session.execute({
      type: 'test/lock',
      label: 'lock',
      apply(draft) {
        const target = draft.objects[DESK];
        if (target) target.locked = true;
      },
    });
    expect(controller.begin(DESK, level(0.4))).toBe(false);
  });
});
