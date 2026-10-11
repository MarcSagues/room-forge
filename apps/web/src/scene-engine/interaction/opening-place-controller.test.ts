import { createEditorSession, type EditorSession, type Opening } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { Ray, Vector3 } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpeningPlaceController } from './opening-place-controller';
import { createTransientStore, type TransientStore } from './transient-store';

// Fixture room 4 × 3 × 2.6 at the world origin; window-1 (0.9) on the north wall at 0.5, door-1
// on the south wall at 0.5.
const ray = (from: [number, number, number], to: [number, number, number]) =>
  new Ray(new Vector3(...from), new Vector3(...to).normalize());

let session: EditorSession;
let transient: TransientStore;
let invalidate: ReturnType<typeof vi.fn<() => void>>;
let controller: OpeningPlaceController;

const openings = () => Object.values(session.getState().document.openings) as Opening[];

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  transient = createTransientStore();
  invalidate = vi.fn<() => void>();
  controller = new OpeningPlaceController({ session, transient, invalidate });
});

describe('OpeningPlaceController', () => {
  it('centres the opening on the wall under the pointer and creates it on release, selected', () => {
    expect(controller.begin('window.standard')).toBe(true);
    expect(transient.opening()).toMatchObject({ id: null, visible: false });
    controller.update(ray([2, 1.5, 1.5], [1, 0, 0]), false); // the east wall, 1.5 m along it
    expect(transient.opening()).toMatchObject({
      wall: 'east',
      offset: expect.closeTo(1),
      sill: 0.9,
      valid: true,
      visible: true,
    });
    expect(openings()).toHaveLength(2); // nothing created while dragging
    expect(controller.end()?.ok).toBe(true);
    const created = openings().find((o) => o.wall === 'east');
    expect(created).toMatchObject({ kind: 'window', variant: 'window.standard', offset: 1 });
    expect(session.getState().selection).toEqual([created?.id]);
    expect(transient.opening()).toBeNull();
    session.undo();
    expect(openings()).toHaveLength(2);
  });

  it('skips a near wall crossed from outside and lands on the wall seen through it', () => {
    controller.begin('door.single');
    controller.update(ray([2, 1.5, 10], [0, 0, -1]), false);
    expect(transient.opening()).toMatchObject({ wall: 'north', offset: expect.closeTo(1.6) });
  });

  it('flags an overlap, and then creates nothing', () => {
    controller.begin('window.standard');
    controller.update(ray([1, 1.5, 1.5], [0, 0, -1]), false); // over window-1 on the north wall
    expect(transient.opening()).toMatchObject({ wall: 'north', valid: false, visible: true });
    expect(controller.end()).toBeNull();
    expect(openings()).toHaveLength(2);
  });

  it('shows nothing and creates nothing off the walls or outside the viewport', () => {
    controller.begin('window.large');
    controller.update(ray([2, 1, 1.5], [0, 1, 0]), false);
    expect(transient.opening()?.visible).toBe(false);
    controller.update(null, false);
    expect(transient.opening()?.visible).toBe(false);
    expect(controller.end()).toBeNull();
    expect(openings()).toHaveLength(2);
  });

  it('refuses unknown variants', () => {
    expect(controller.begin('window.round')).toBe(false);
    expect(transient.opening()).toBeNull();
  });

  it('Enter or click: on the wall in front, or else centred on the first wall where it fits', () => {
    expect(controller.placeAtCenter('door.double', null)?.ok).toBe(true);
    const created = openings().find((o) => o.variant === 'door.double');
    // Centred on the north wall it would overlap window-1: the east wall is next.
    expect(created).toMatchObject({ wall: 'east', offset: expect.closeTo(0.7) });
    expect(controller.placeAtCenter('window.standard', ray([2, 1.5, 1.5], [-1, 0, 0]))?.ok).toBe(
      true,
    );
    expect(openings().some((o) => o.wall === 'west')).toBe(true);
  });
});
