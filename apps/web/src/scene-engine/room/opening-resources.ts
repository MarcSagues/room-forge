import { BoxGeometry, MeshStandardMaterial } from 'three';
import type { OpeningSlot } from './opening-parts';

/**
 * The geometry and materials every door and window is drawn with (AGENTS rule 6): one unit box,
 * stretched per part through instancing, and one material per slot. Meshes use them with
 * `dispose={null}`; they live as long as the page, like the placeholder resources. All three are
 * flagged transparent (frame and leaf stay fully opaque), so they share one shader program: the
 * glass needs it, and opaque and transparent materials compile to different programs. Day and
 * night (P5-06) drive the glass emissive colour and opacity: the sky seen through the windows.
 */
let shared:
  | { geometry: BoxGeometry; materials: Readonly<Record<OpeningSlot, MeshStandardMaterial>> }
  | undefined;

export function openingResources() {
  shared ??= {
    geometry: new BoxGeometry(1, 1, 1),
    materials: {
      frame: new MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.5, transparent: true }),
      leaf: new MeshStandardMaterial({ color: '#b88a55', roughness: 0.65, transparent: true }),
      glass: new MeshStandardMaterial({
        color: '#cfe3ee',
        roughness: 0.05,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    },
  };
  return shared;
}
