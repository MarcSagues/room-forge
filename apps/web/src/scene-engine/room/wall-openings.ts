import { Group, InstancedMesh, Matrix4 } from 'three';
import {
  MAX_OPENING_PARTS,
  OPENING_SLOTS,
  type OpeningShape,
  type OpeningSlot,
  type PartSink,
  writeOpeningParts,
} from './opening-parts';
import { openingResources } from './opening-resources';

/** Openings a wall can show at once: the limit (I4) plus one being dragged in. */
export const MAX_OPENINGS = 7;
const CAPACITY = MAX_OPENINGS * MAX_OPENING_PARTS;

/**
 * The doors and windows of one wall, in the wall's frame (see `buildWallMesh`): one instanced mesh
 * per slot over the shared unit box, so a wall costs at most three draw calls however many
 * openings it has, and laying it out again (while an opening is dragged) only rewrites matrices.
 * `begin` → `add` per opening → `commit`; nothing allocates after construction.
 */
export class WallOpeningsLayer {
  readonly group = new Group();
  readonly meshes: Readonly<Record<OpeningSlot, InstancedMesh>>;
  private readonly counts: Record<OpeningSlot, number> = { frame: 0, leaf: 0, glass: 0 };
  private readonly matrix = new Matrix4();
  private baseX = 0;
  private baseY = 0;
  private baseZ = 0;
  private readonly sink: PartSink;

  constructor() {
    const { geometry, materials } = openingResources();
    const make = (slot: OpeningSlot) => {
      const mesh = new InstancedMesh(geometry, materials[slot], CAPACITY);
      mesh.name = `openings:${slot}`;
      mesh.count = 0;
      mesh.visible = false;
      // The bounding sphere would be computed once and then go stale as openings move.
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    this.meshes = { frame: make('frame'), leaf: make('leaf'), glass: make('glass') };
    this.sink = (slot, cx, cy, cz, sx, sy, sz) => {
      const index = this.counts[slot];
      if (index >= CAPACITY) return;
      this.matrix
        .makeScale(sx, sy, sz)
        .setPosition(this.baseX + cx, this.baseY + cy, this.baseZ + cz);
      this.meshes[slot].setMatrixAt(index, this.matrix);
      this.counts[slot] = index + 1;
    };
  }

  begin(): void {
    this.counts.frame = 0;
    this.counts.leaf = 0;
    this.counts.glass = 0;
  }

  /**
   * Adds an opening whose hole is centred at `centreU` along the wall, starting `sill` above the
   * floor, through a wall `thickness` thick (the wall body is `z ∈ [-thickness, 0]`).
   */
  add(opening: OpeningShape, centreU: number, sill: number, thickness: number): void {
    this.baseX = centreU;
    this.baseY = sill;
    // The parts are centred on the middle of the wall's body.
    this.baseZ = -thickness / 2;
    writeOpeningParts(opening, thickness, this.sink);
  }

  commit(): void {
    for (const slot of OPENING_SLOTS) {
      const mesh = this.meshes[slot];
      mesh.count = this.counts[slot];
      mesh.instanceMatrix.needsUpdate = true;
      // An empty instanced mesh draws nothing but would still have its shader compiled.
      mesh.visible = mesh.count > 0;
    }
  }

  /** Frees the instance buffers; the shared geometry and materials stay. */
  dispose(): void {
    for (const slot of OPENING_SLOTS) this.meshes[slot].dispose();
  }
}
