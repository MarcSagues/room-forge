import { Group, InstancedMesh, Matrix4, Vector3 } from 'three';
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
/** Widest a door opens (`open = 1`), as in core's `DOOR_MAX_ANGLE`. */
const MAX_ANGLE = Math.PI / 2;

/** What `add` accepts: an opening, with its id and door state when it has them. */
export interface LayerOpening extends OpeningShape {
  readonly id?: string | null;
  /** Doors: 0 closed … 1 open (DOMAIN_MODEL §8.1). */
  readonly open?: number;
}

/** One opening as last laid out, kept so a swinging door can be drawn again without React. */
interface Slot {
  id: string | null;
  kind: 'door' | 'window';
  variant: string;
  width: number;
  height: number;
  swing: 'in' | 'out';
  hinge: 'left' | 'right';
  centreU: number;
  sill: number;
  thickness: number;
  /** Where the door is going (0…1) and where it is drawn now. */
  target: number;
  shown: number;
  /** Seen since the last `begin` (unseen slots are dropped on `commit`). */
  seen: boolean;
}

const emptySlot = (): Slot => ({
  id: null,
  kind: 'door',
  variant: '',
  width: 0,
  height: 0,
  swing: 'in',
  hinge: 'left',
  centreU: 0,
  sill: 0,
  thickness: 0,
  target: 0,
  shown: 0,
  seen: false,
});

/**
 * The doors and windows of one wall, in the wall's frame (see `buildWallMesh`): one instanced mesh
 * per slot over the shared unit box, so a wall costs at most three draw calls however many
 * openings it has, and laying it out again (while an opening is dragged or a door swings) only
 * rewrites matrices. `begin` → `add` per opening → `commit`; nothing allocates after construction.
 *
 * Door leaves swing (P10-02): a door whose `open` changes keeps being drawn where it was and
 * `step` eases it towards the new value; a door seen for the first time is drawn where it is.
 */
export class WallOpeningsLayer {
  readonly group = new Group();
  readonly meshes: Readonly<Record<OpeningSlot, InstancedMesh>>;
  private readonly counts: Record<OpeningSlot, number> = { frame: 0, leaf: 0, glass: 0 };
  private readonly matrix = new Matrix4();
  private readonly scale = new Vector3();
  private readonly slots: Slot[] = [];
  private slotCount = 0;
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
    for (let i = 0; i < MAX_OPENINGS; i += 1) this.slots.push(emptySlot());
    this.sink = (slot, cx, cy, cz, sx, sy, sz, ry) => {
      const index = this.counts[slot];
      if (index >= CAPACITY) return;
      this.matrix
        .makeRotationY(ry)
        .scale(this.scale.set(sx, sy, sz))
        .setPosition(this.baseX + cx, this.baseY + cy, this.baseZ + cz);
      this.meshes[slot].setMatrixAt(index, this.matrix);
      this.counts[slot] = index + 1;
    };
  }

  /** True while a door leaf is still on its way. */
  get swinging(): boolean {
    for (let i = 0; i < this.slotCount; i += 1) {
      const slot = this.slots[i] as Slot;
      if (slot.shown !== slot.target) return true;
    }
    return false;
  }

  begin(): void {
    for (let i = 0; i < this.slotCount; i += 1) (this.slots[i] as Slot).seen = false;
  }

  /**
   * Adds an opening whose hole is centred at `centreU` along the wall, starting `sill` above the
   * floor, through a wall `thickness` thick (the wall body is `z ∈ [-thickness, 0]`). Without a
   * door state (a dragged opening) a known door keeps the one it had.
   */
  add(opening: LayerOpening, centreU: number, sill: number, thickness: number): void {
    const id = opening.id ?? null;
    let slot = id === null ? undefined : this.find(id);
    if (!slot) {
      if (this.slotCount >= MAX_OPENINGS) return;
      slot = this.slots[this.slotCount] as Slot;
      this.slotCount += 1;
      slot.id = id;
      slot.swing = 'in';
      slot.hinge = 'left';
      slot.target = opening.open ?? 0;
      slot.shown = slot.target;
    }
    slot.seen = true;
    slot.kind = opening.kind;
    slot.variant = opening.variant;
    slot.width = opening.width;
    slot.height = opening.height;
    if (opening.swing) slot.swing = opening.swing;
    if (opening.hinge) slot.hinge = opening.hinge;
    if (opening.open !== undefined) slot.target = opening.open;
    slot.centreU = centreU;
    slot.sill = sill;
    slot.thickness = thickness;
  }

  commit(): void {
    // Drop the openings that were not added again, keeping the others packed at the front.
    let kept = 0;
    for (let i = 0; i < this.slotCount; i += 1) {
      const slot = this.slots[i] as Slot;
      if (!slot.seen) continue;
      if (kept !== i) {
        this.slots[i] = this.slots[kept] as Slot;
        this.slots[kept] = slot;
      }
      kept += 1;
    }
    this.slotCount = kept;
    this.draw();
  }

  /**
   * Moves every swinging leaf towards its target, `stepMs` of a `durationMs` full swing (0: jump
   * there), and draws the wall again. Returns whether a leaf is still moving.
   */
  step(stepMs: number, durationMs: number): boolean {
    const delta = durationMs <= 0 ? 1 : stepMs / durationMs;
    let changed = false;
    for (let i = 0; i < this.slotCount; i += 1) {
      const slot = this.slots[i] as Slot;
      if (slot.shown === slot.target) continue;
      const gap = slot.target - slot.shown;
      slot.shown = Math.abs(gap) <= delta ? slot.target : slot.shown + Math.sign(gap) * delta;
      changed = true;
    }
    if (changed) this.draw();
    return this.swinging;
  }

  /** How far the door `id` is drawn open (0…1), or null if this wall does not show it. */
  shownOpen(id: string): number | null {
    return this.find(id)?.shown ?? null;
  }

  /** Frees the instance buffers; the shared geometry and materials stay. */
  dispose(): void {
    for (const slot of OPENING_SLOTS) this.meshes[slot].dispose();
  }

  private find(id: string): Slot | undefined {
    for (let i = 0; i < this.slotCount; i += 1) {
      const slot = this.slots[i] as Slot;
      if (slot.id === id) return slot;
    }
    return undefined;
  }

  private draw(): void {
    this.counts.frame = 0;
    this.counts.leaf = 0;
    this.counts.glass = 0;
    for (let i = 0; i < this.slotCount; i += 1) {
      const slot = this.slots[i] as Slot;
      this.baseX = slot.centreU;
      this.baseY = slot.sill;
      // The parts are centred on the middle of the wall's body.
      this.baseZ = -slot.thickness / 2;
      const angle = slot.kind === 'door' ? Math.min(Math.max(slot.shown, 0), 1) * MAX_ANGLE : 0;
      writeOpeningParts(slot, slot.thickness, this.sink, angle);
    }
    for (const slot of OPENING_SLOTS) {
      const mesh = this.meshes[slot];
      mesh.count = this.counts[slot];
      mesh.instanceMatrix.needsUpdate = true;
      // An empty instanced mesh draws nothing but would still have its shader compiled.
      mesh.visible = mesh.count > 0;
    }
  }
}
