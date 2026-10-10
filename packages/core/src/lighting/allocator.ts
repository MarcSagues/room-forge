import type { ObjectId, Vec3 } from '../domain';
import type { Luminaire, PoolLightType } from './luminaires';

/** How many three.js lights of each type the scene keeps, whatever it shows (ADR-0006, P2-11). */
export interface LightPoolSize {
  readonly point: number;
  readonly spot: number;
}

/** Graphics quality levels; the settings that choose one arrive with P5-10. */
export type LightQuality = 'low' | 'medium' | 'high';

/**
 * Pool sizes per quality, from the P2-11 measurements: a `SpotLight` costs ≈1.4× a `PointLight`,
 * and every light shades every lit pixel, so low quality keeps four points and no spots. Changing
 * the level may compile shaders once; nothing else does.
 */
export const LIGHT_POOL_SIZES: Readonly<Record<LightQuality, LightPoolSize>> = {
  low: { point: 4, spot: 0 },
  medium: { point: 8, spot: 2 },
  high: { point: 12, spot: 4 },
};

/** Where the camera is and where it looks (`direction` need not be unit length). */
export interface AllocatorView {
  readonly position: Vec3;
  readonly direction: Vec3;
}

/** Which luminaire every light of the pool shows, slot by slot; `null` is a light left dark. */
export interface LightAllocation {
  readonly point: readonly (ObjectId | null)[];
  readonly spot: readonly (ObjectId | null)[];
}

/**
 * A luminaire that already has a light keeps it until another one is this much more important:
 * orbiting past two lamps at almost the same distance must not swap them back and forth.
 */
export const ALLOCATION_HYSTERESIS = 1.25;

/** Selected luminaires are what the user is looking at: they win a light first. */
const SELECTED_BOOST = 2;
/** A heavier light (a long strip, a panel) gives way a little to a lighter one at equal merit. */
const COST_FACTOR: Readonly<Record<Luminaire['cost'], number>> = { 0: 0, 1: 1, 2: 0.9 };

export function emptyAllocation(pool: LightPoolSize): LightAllocation {
  return {
    point: Array.from({ length: pool.point }, () => null),
    spot: Array.from({ length: pool.spot }, () => null),
  };
}

/** Only a luminaire that is on, gives some light and has a cost may take a real light. */
const eligible = (luminaire: Luminaire) =>
  luminaire.on && luminaire.intensity > 0 && luminaire.cost > 0;

/**
 * How much a luminaire deserves a real light: its intensity, how near the camera it is, whether
 * the camera looks towards it (one behind it still lights what is seen, so it keeps a fifth), and
 * whether it is selected, less a little for a heavier light. Always positive for an eligible one.
 */
export function luminaireImportance(luminaire: Luminaire, view: AllocatorView): number {
  const dx = luminaire.position[0] - view.position[0];
  const dy = luminaire.position[1] - view.position[1];
  const dz = luminaire.position[2] - view.position[2];
  const distance = Math.hypot(dx, dy, dz);
  const [lx, ly, lz] = view.direction;
  const length = Math.hypot(lx, ly, lz);
  // Normalised one factor at a time: the product of two tiny lengths would underflow to 0/0.
  const cos =
    (dx / distance) * (lx / length) +
    (dy / distance) * (ly / length) +
    (dz / distance) * (lz / length);
  const visibility = Number.isFinite(cos) ? 0.6 + 0.4 * Math.max(-1, Math.min(1, cos)) : 1;
  const focus = luminaire.selected ? SELECTED_BOOST : 1;
  return (luminaire.intensity * visibility * focus * COST_FACTOR[luminaire.cost]) / (1 + distance);
}

interface Ranked {
  readonly luminaire: Luminaire;
  readonly score: number;
}

/** Highest score first; the id breaks ties, so the order never depends on the input's. */
function byMerit(a: Ranked, b: Ranked): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.luminaire.id === b.luminaire.id) return 0;
  return a.luminaire.id < b.luminaire.id ? -1 : 1;
}

/**
 * Puts the winners into `size` slots: a winner that already had a slot keeps it (its light does not
 * jump), the others fill the free slots from the first, in order of merit.
 */
function seat(
  winners: readonly ObjectId[],
  size: number,
  previous: readonly (ObjectId | null)[],
): (ObjectId | null)[] {
  const slots: (ObjectId | null)[] = Array.from({ length: size }, () => null);
  const seated = new Set<ObjectId>();
  const wanted = new Set(winners);
  previous.forEach((id, index) => {
    if (id !== null && index < size && wanted.has(id) && !seated.has(id)) {
      slots[index] = id;
      seated.add(id);
    }
  });
  let free = 0;
  for (const id of winners) {
    if (seated.has(id)) continue;
    while (slots[free] !== null) free += 1;
    slots[free] = id;
    seated.add(id);
  }
  return slots;
}

/**
 * Decides which luminaires get one of the pool's real lights (P5-05); the rest only glow. Pure and
 * deterministic: the same luminaires, view, pool and previous allocation give the same result,
 * whatever order the luminaires come in (ids are unique). Spot luminaires take the spot lights
 * first; a spot luminaire that finds none left competes with the others for a point light, so a
 * desk lamp still lights its desk at low quality. Never more lights than the pool has.
 *
 * `previous` is the allocation in force: its luminaires get `ALLOCATION_HYSTERESIS` and keep their
 * slots, so the assignment only changes when the scene or the view really changed.
 */
export function allocateLights(
  luminaires: readonly Luminaire[],
  view: AllocatorView,
  pool: LightPoolSize,
  previous: LightAllocation = emptyAllocation(pool),
): LightAllocation {
  const holders = new Set<ObjectId>();
  for (const id of [...previous.point, ...previous.spot]) if (id !== null) holders.add(id);

  const ranked: Ranked[] = [];
  const seen = new Set<ObjectId>();
  for (const luminaire of luminaires) {
    if (!eligible(luminaire) || seen.has(luminaire.id)) continue;
    seen.add(luminaire.id);
    const score = luminaireImportance(luminaire, view);
    ranked.push({
      luminaire,
      score: holders.has(luminaire.id) ? score * ALLOCATION_HYSTERESIS : score,
    });
  }
  ranked.sort(byMerit);

  const spotWinners: ObjectId[] = [];
  const pointWinners: ObjectId[] = [];
  for (const { luminaire } of ranked) {
    const type: PoolLightType = luminaire.type;
    if (type === 'spot' && spotWinners.length < pool.spot) spotWinners.push(luminaire.id);
    else if (pointWinners.length < pool.point) pointWinners.push(luminaire.id);
  }
  return {
    point: seat(pointWinners, pool.point, previous.point),
    spot: seat(spotWinners, pool.spot, previous.spot),
  };
}
