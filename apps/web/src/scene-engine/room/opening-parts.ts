/** What a part of a door or window is drawn with: one shared material each. */
export type OpeningSlot = 'frame' | 'leaf' | 'glass';

export const OPENING_SLOTS: readonly OpeningSlot[] = ['frame', 'leaf', 'glass'];

/** Width of the frame members seen from the room, in metres. */
export const FRAME_WIDTH = 0.05;
/** How far the frame stands out of each face of the wall, so it covers the edge of the hole. */
export const FRAME_PROUD = 0.01;
const LEAF_THICKNESS = 0.04;
const GLASS_THICKNESS = 0.01;
/** Gap between a door leaf and its frame (and between the two leaves of a double door). */
const GAP = 0.004;

/** Most parts any variant has (a large window: four frame members, a mullion and two panes). */
export const MAX_OPENING_PARTS = 7;

/**
 * Receives one box: its slot, centre, size and turn about Y (radians; only an open door leaf
 * turns), in the opening's frame. A callback rather than a returned list so that laying out a wall
 * while an opening is dragged or a door swings allocates nothing.
 */
export type PartSink = (
  slot: OpeningSlot,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  ry: number,
) => void;

/** The opening as the parts need it. */
export interface OpeningShape {
  readonly kind: 'door' | 'window';
  readonly variant: string;
  readonly width: number;
  readonly height: number;
  /** Doors only (DOMAIN_MODEL §8.1); missing means into the room and hinged on the left. */
  readonly swing?: 'in' | 'out';
  readonly hinge?: 'left' | 'right';
}

/**
 * The parametric door or window of an opening (P3-12) as boxes, in the **opening frame**: origin at
 * the bottom centre of the hole and the middle of the wall, `x` along the wall, `y` up and `+z`
 * towards the room. Doors get jambs, a head and one leaf (two for `door.double`); windows get a
 * full frame and a pane (two panes and a mullion for `window.large`). Every box stays inside the
 * hole's outline, standing `FRAME_PROUD` out of each face of a wall `thickness` thick, except
 * an open door leaf: `angle` (radians, 0 closed) turns it about its hinge, at the jamb on the
 * `hinge` side seen from the room (`-x` is left), towards `+z` when it swings in. A double
 * door has a leaf on each jamb.
 */
export function writeOpeningParts(
  opening: OpeningShape,
  thickness: number,
  sink: PartSink,
  angle = 0,
) {
  const { width: w, height: h } = opening;
  const f = Math.min(FRAME_WIDTH, w / 4, h / 4);
  const depth = thickness + 2 * FRAME_PROUD;
  const inner = w - 2 * f;
  // Jambs and head, common to both kinds.
  sink('frame', -w / 2 + f / 2, h / 2, 0, f, h, depth, 0);
  sink('frame', w / 2 - f / 2, h / 2, 0, f, h, depth, 0);
  sink('frame', 0, h - f / 2, 0, inner, f, depth, 0);

  if (opening.kind === 'door') {
    const leafHeight = h - f - GAP;
    const leaves = opening.variant === 'door.double' ? 2 : 1;
    const leafWidth = (inner - (leaves + 1) * GAP) / leaves;
    const swing = opening.swing === 'out' ? -1 : 1;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let i = 0; i < leaves; i += 1) {
      // +1: hinged on the left jamb (−x), the leaf reaching towards +x; −1: the mirror image.
      const side = leaves === 2 ? (i === 0 ? 1 : -1) : opening.hinge === 'right' ? -1 : 1;
      const pivot = -side * (inner / 2 - GAP);
      const reach = leafWidth / 2;
      sink(
        'leaf',
        pivot + side * reach * cos,
        leafHeight / 2,
        swing * reach * sin,
        leafWidth,
        leafHeight,
        LEAF_THICKNESS,
        -side * swing * angle,
      );
    }
    return;
  }

  sink('frame', 0, f / 2, 0, inner, f, depth, 0);
  const paneHeight = h - 2 * f;
  if (opening.variant === 'window.large') {
    sink('frame', 0, h / 2, 0, f, paneHeight, depth / 2, 0);
    const pane = (inner - f) / 2;
    sink('glass', -(f + pane) / 2, h / 2, 0, pane, paneHeight, GLASS_THICKNESS, 0);
    sink('glass', (f + pane) / 2, h / 2, 0, pane, paneHeight, GLASS_THICKNESS, 0);
    return;
  }
  sink('glass', 0, h / 2, 0, inner, paneHeight, GLASS_THICKNESS, 0);
}
