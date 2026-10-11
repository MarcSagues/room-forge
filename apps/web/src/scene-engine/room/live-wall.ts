import type { EditorSession, Opening, OpeningId, RoomId, WallId } from '@roomforge/core';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  type Object3D,
} from 'three';
import { outlineGeometry } from '../interaction/outline-geometry';
import { tokenColor } from '../interaction/token-color';
import type { OpeningDragState, TransientStore } from '../interaction/transient-store';
import { FRAME_PROUD } from './opening-parts';
import { type WallHole, WallMeshWriter } from './wall-mesh';
import { MAX_OPENINGS, type WallOpeningsLayer } from './wall-openings';

export interface LiveWallDeps {
  session: EditorSession;
  transient: TransientStore;
  layer: WallOpeningsLayer;
  roomId: RoomId;
  wall: WallId;
  /** Where the interior starts along the wall frame (N/S frames cover the corners). */
  shift: number;
  thickness: number;
}

/**
 * The live hole (P3-12): while a door or window is dragged over this wall, the wall is drawn from
 * a mesh of its own, rewritten in place from the transient store with the dragged opening's hole,
 * and its fittings are laid out again; the cached wall mesh is hidden meanwhile (`visible`). The
 * buffers are made the first time and then reused: a drag step allocates nothing. When the drag
 * ends (or leaves the wall) the cached wall shows again, with the document's openings.
 */
export class LiveWall {
  readonly mesh = new Mesh();
  /** Where a new opening dragged in from the catalog would go: accent, or red if it does not fit. */
  readonly outline = new LineSegments(outlineGeometry());
  /** The cached wall mesh it stands in for, and the wall's dimensions (set by the view). */
  surface: Object3D | null = null;
  length = 0;
  height = 0;
  private readonly deps: LiveWallDeps;
  private writer: WallMeshWriter | null = null;
  private readonly holes: { u0: number; u1: number; v0: number; v1: number }[] = [];
  private active = false;

  constructor(deps: LiveWallDeps) {
    this.deps = deps;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.outline.visible = false;
    this.outline.renderOrder = 10;
    for (let i = 0; i < MAX_OPENINGS; i += 1) this.holes.push({ u0: 0, u1: 0, v0: 0, v1: 0 });
  }

  /** The wall's (fading) material: the live mesh is drawn with the same one. */
  setMaterial(material: Material | null): void {
    if (material) this.mesh.material = material;
  }

  get drawing(): boolean {
    return this.active;
  }

  /** Follows the transient store; call on each of its notifications. */
  sync(): void {
    const drag = this.deps.transient.opening();
    const mine =
      drag !== null &&
      drag.visible &&
      drag.roomId === this.deps.roomId &&
      drag.wall === this.deps.wall;
    if (mine) this.draw(drag);
    else if (this.active) this.restore();
  }

  dispose(): void {
    if (this.writer) this.mesh.geometry.dispose();
  }

  private draw(drag: Readonly<OpeningDragState>) {
    const { layer, shift, thickness } = this.deps;
    const writer = this.ensureWriter();
    let count = 0;
    layer.begin();
    const openings = this.deps.session.getState().document.openings;
    for (const id in openings) {
      const opening = openings[id as OpeningId] as Opening;
      if (!this.onWall(opening) || opening.id === drag.id || count >= MAX_OPENINGS - 1) continue;
      this.hole(count, opening.offset, opening.width, opening.sill, opening.height);
      layer.add(opening, shift + opening.offset + opening.width / 2, opening.sill, thickness);
      count += 1;
    }
    // Where it does not fit (overlapping another hole) neither its hole nor its fittings are
    // drawn: the red outline shows where it would go.
    if (drag.valid) {
      layer.add(drag, shift + drag.offset + drag.width / 2, drag.sill, thickness);
      this.hole(count, drag.offset, drag.width, drag.sill, drag.height);
      count += 1;
    }
    layer.commit();
    this.placeOutline(drag);

    writer.write(this.length, this.height, thickness, this.holes as readonly WallHole[], count);
    const geometry = this.mesh.geometry;
    for (let i = 0; i < ATTRIBUTES.length; i += 1) {
      (geometry.getAttribute(ATTRIBUTES[i] as string) as BufferAttribute).needsUpdate = true;
    }
    (geometry.index as BufferAttribute).needsUpdate = true;
    geometry.setDrawRange(0, writer.indexCount);
    this.mesh.visible = true;
    if (this.surface) this.surface.visible = false;
    this.active = true;
  }

  private restore() {
    const { layer, shift, thickness } = this.deps;
    layer.begin();
    const openings = this.deps.session.getState().document.openings;
    for (const id in openings) {
      const opening = openings[id as OpeningId] as Opening;
      if (this.onWall(opening)) {
        layer.add(opening, shift + opening.offset + opening.width / 2, opening.sill, thickness);
      }
    }
    layer.commit();
    this.mesh.visible = false;
    this.outline.visible = false;
    if (this.surface) this.surface.visible = true;
    this.active = false;
  }

  /** Only for a new opening: one being slid is selected, and the selection outline follows it. */
  private placeOutline(drag: Readonly<OpeningDragState>) {
    const outline = this.outline;
    outline.visible = drag.id === null;
    if (!outline.visible) return;
    const depth = this.deps.thickness + 2 * FRAME_PROUD;
    outline.position.set(
      this.deps.shift + drag.offset + drag.width / 2,
      drag.sill,
      -this.deps.thickness / 2,
    );
    outline.scale.set(drag.width * INFLATE, drag.height * INFLATE, depth * INFLATE);
    const materials = ghostMaterials();
    outline.material = drag.valid ? materials.valid : materials.invalid;
  }

  private onWall(opening: Opening) {
    return opening.roomId === this.deps.roomId && opening.wall === this.deps.wall;
  }

  private hole(index: number, offset: number, width: number, sill: number, height: number) {
    const hole = this.holes[index];
    if (!hole) return;
    hole.u0 = this.deps.shift + offset;
    hole.u1 = this.deps.shift + offset + width;
    hole.v0 = sill;
    hole.v1 = sill + height;
  }

  private ensureWriter(): WallMeshWriter {
    if (this.writer) return this.writer;
    const writer = new WallMeshWriter(MAX_OPENINGS);
    const geometry = new BufferGeometry();
    const attribute = (array: Float32Array, size: number) =>
      new BufferAttribute(array, size).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', attribute(writer.positions, 3));
    geometry.setAttribute('normal', attribute(writer.normals, 3));
    geometry.setAttribute('uv', attribute(writer.uvs, 2));
    geometry.setIndex(new BufferAttribute(writer.indices, 1).setUsage(DynamicDrawUsage));
    this.mesh.geometry = geometry;
    this.writer = writer;
    return writer;
  }
}

const ATTRIBUTES = ['position', 'normal', 'uv'] as const;
const INFLATE = 1.02;

let ghost: { valid: LineBasicMaterial; invalid: LineBasicMaterial } | undefined;

/** Outline materials shared by every wall (rule 6), drawn over everything like the selection. */
function ghostMaterials() {
  const line = (color: string) =>
    new LineBasicMaterial({ color: new Color(color), depthTest: false, transparent: true });
  ghost ??= {
    valid: line(tokenColor('--accent', '#ff7a45')),
    invalid: line(tokenColor('--danger', '#f2555a')),
  };
  return ghost;
}
