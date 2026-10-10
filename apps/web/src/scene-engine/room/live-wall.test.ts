import { createEditorSession, type OpeningId, type RoomId } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { type BufferAttribute, Object3D } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTransientStore, type OpeningDragState } from '../interaction/transient-store';
import { areaFacing } from './geometry-test-utils';
import { LiveWall } from './live-wall';
import type { MeshData } from './mesh-data';
import { WALL_THICKNESS } from './room-geometry';
import { WallOpeningsLayer } from './wall-openings';

// Fixture room 4 × 3 × 2.6; window-1 (0.9 × 1.2, sill 0.9) on the north wall at 0.5.
const T = WALL_THICKNESS;
const LENGTH = 4 + 2 * T;
const HEIGHT = 2.6;
const HOLE = 0.9 * 1.2;

const drag = (overrides: Partial<OpeningDragState> = {}): OpeningDragState => ({
  id: 'window-1' as OpeningId,
  roomId: 'room-1' as RoomId,
  wall: 'north',
  kind: 'window',
  variant: 'window.standard',
  offset: 2,
  width: 0.9,
  height: 1.2,
  sill: 0.9,
  valid: true,
  visible: true,
  ...overrides,
});

let transient: ReturnType<typeof createTransientStore>;
let layer: WallOpeningsLayer;
let live: LiveWall;
let surface: Object3D;

/** What the live mesh draws right now, as mesh data. */
function drawn(): MeshData {
  const geometry = live.mesh.geometry;
  const attribute = (name: string) => (geometry.getAttribute(name) as BufferAttribute).array;
  return {
    positions: attribute('position') as Float32Array,
    normals: attribute('normal') as Float32Array,
    uvs: attribute('uv') as Float32Array,
    indices: ((geometry.index as BufferAttribute).array as Uint32Array).subarray(
      0,
      geometry.drawRange.count,
    ),
  };
}

/** Is there a jamb (a reveal facing along the wall) at `u` on the live mesh? */
const jambAt = (u: number) => areaFacing(drawn(), [1, 0, 0], { axis: 0, value: u }) > 0;

beforeEach(() => {
  const session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  transient = createTransientStore();
  layer = new WallOpeningsLayer();
  live = new LiveWall({
    session,
    transient,
    layer,
    roomId: 'room-1' as RoomId,
    wall: 'north',
    shift: T,
    thickness: T,
  });
  live.length = LENGTH;
  live.height = HEIGHT;
  surface = new Object3D();
  live.surface = surface;
  transient.subscribe(() => live.sync());
});

describe('LiveWall', () => {
  it('stands in for the wall while an opening is dragged over it, with the hole where it is', () => {
    transient.publishOpening(drag());
    expect(live.drawing).toBe(true);
    expect(live.mesh.visible).toBe(true);
    expect(surface.visible).toBe(false);
    expect(areaFacing(drawn(), [0, 0, 1], { axis: 2, value: 0 })).toBeCloseTo(
      LENGTH * HEIGHT - HOLE,
      4,
    );
    expect(jambAt(T + 2)).toBe(true);
    // Not at its old place any more.
    expect(jambAt(T + 0.5)).toBe(false);
    expect(layer.meshes.glass.count).toBe(1);
  });

  it('follows the drag in place: same buffers, new hole', () => {
    transient.publishOpening(drag());
    const positions = live.mesh.geometry.getAttribute('position');
    transient.publishOpening(drag({ offset: 3 }));
    expect(live.mesh.geometry.getAttribute('position')).toBe(positions);
    expect(jambAt(T + 3)).toBe(true);
    expect(jambAt(T + 2)).toBe(false);
  });

  it('draws neither hole nor fittings where the opening does not fit', () => {
    transient.publishOpening(drag({ valid: false }));
    expect(layer.meshes.glass.count).toBe(0);
    expect(areaFacing(drawn(), [0, 0, 1], { axis: 2, value: 0 })).toBeCloseTo(LENGTH * HEIGHT, 4);
  });

  it('gives the wall back when the drag ends or moves to another wall', () => {
    transient.publishOpening(drag());
    transient.publishOpening(drag({ wall: 'east' }));
    expect(live.drawing).toBe(false);
    expect(surface.visible).toBe(true);
    expect(live.mesh.visible).toBe(false);
    // The fittings are laid out from the document again: the window at its stored place.
    expect(layer.meshes.glass.count).toBe(1);
    transient.publishOpening(drag());
    transient.clearOpening();
    expect(live.drawing).toBe(false);
    expect(surface.visible).toBe(true);
  });

  it('ignores drags in other rooms and other kinds of drag', () => {
    transient.publishOpening(drag({ roomId: 'room-2' as RoomId }));
    expect(live.drawing).toBe(false);
    transient.publishOpening(drag({ visible: false }));
    expect(live.drawing).toBe(false);
  });
});
