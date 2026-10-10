import type {
  DeepReadonly,
  HexColor,
  LightState,
  ObjectId,
  PlacedObject,
  SceneDocument,
  Vec3,
} from '../domain';
import type { CatalogItem, CatalogProvider, LightCapability } from '../ports';

/** The two kinds of three.js light the pool holds (no `RectAreaLight` in the MVP, P2-11). */
export type PoolLightType = 'point' | 'spot';

/** Lamps that shine one way take a spot; strips, bars, panels, neon and bulbs a point. */
export function poolLightType(kind: LightCapability['kind']): PoolLightType {
  return kind === 'spot' ? 'spot' : 'point';
}

/** The light of an object: its own state, or the item's defaults when it was never set. */
export function lightStateOf(
  object: Pick<DeepReadonly<PlacedObject>, 'light'>,
  item: CatalogItem | undefined,
): LightState {
  if (object.light) {
    const { on, color, intensity, effect } = object.light;
    return { on, color, intensity, effect: effect as LightState['effect'] };
  }
  return {
    on: true,
    color: item?.light?.defaultColor ?? '#ffffff',
    intensity: 1,
    effect: { kind: 'static' },
  };
}

/** A luminaire as the light allocator and the light pool see it, in world coordinates (metres). */
export interface Luminaire {
  readonly id: ObjectId;
  readonly type: PoolLightType;
  readonly cost: LightCapability['cost'];
  readonly on: boolean;
  readonly color: HexColor;
  /** 0–1, from its light state. */
  readonly intensity: number;
  /** The centre of its box: where a point light goes. */
  readonly position: Vec3;
  /** The top centre of its box: where a spot shines from. */
  readonly head: Vec3;
  /** Its heading in radians: its front faces `(sin yaw, 0, cos yaw)`. */
  readonly yaw: number;
  readonly selected: boolean;
}

type Doc = DeepReadonly<SceneDocument>;
type Obj = DeepReadonly<PlacedObject>;

/** The object and its ancestors, innermost first; `null` if one of them is hidden (nothing shows). */
function visibleChain(doc: Doc, object: Obj): Obj[] | null {
  const chain: Obj[] = [];
  const seen = new Set<string>();
  let current: Obj | undefined = object;
  while (current) {
    if (current.hidden || seen.has(current.id)) return current.hidden ? null : chain;
    seen.add(current.id);
    chain.push(current);
    current = current.parentId === null ? undefined : doc.objects[current.parentId];
  }
  return chain;
}

/** A point in `chain[0]`'s frame, carried out through every parent to the room and the world. */
function toWorld(doc: Doc, chain: readonly Obj[], local: Vec3): { point: Vec3; yaw: number } {
  let [x, y, z] = local;
  let yaw = 0;
  for (const object of chain) {
    const { position, rotationY, scale } = object.transform;
    const sx = (scale?.[0] ?? 1) * x;
    const sy = (scale?.[1] ?? 1) * y;
    const sz = (scale?.[2] ?? 1) * z;
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    x = cos * sx + sin * sz + position[0];
    y = sy + position[1];
    z = -sin * sx + cos * sz + position[2];
    yaw += rotationY;
  }
  const root = chain[chain.length - 1];
  const origin = root ? doc.rooms[root.roomId]?.origin : undefined;
  return { point: [x + (origin?.[0] ?? 0), y, z + (origin?.[1] ?? 0)], yaw };
}

/**
 * Every luminaire the scene shows, in document order: the objects whose catalog item gives light
 * and that are not hidden (nor inside a hidden one). Items the catalog does not know are left out:
 * nothing says what light they would give.
 */
export function collectLuminaires(
  doc: Doc,
  catalog: CatalogProvider,
  selection: readonly string[] = [],
): Luminaire[] {
  const selected = new Set(selection);
  const luminaires: Luminaire[] = [];
  for (const id of doc.objectOrder) {
    const object = doc.objects[id];
    if (!object) continue;
    const item = catalog.getItem(object.catalogId);
    if (!item?.light) continue;
    const chain = visibleChain(doc, object);
    if (!chain) continue;
    const state = lightStateOf(object, item);
    const centre = toWorld(doc, chain, [0, item.size.h / 2, 0]);
    const head = toWorld(doc, chain, [0, item.size.h, 0]);
    luminaires.push({
      id: object.id,
      type: poolLightType(item.light.kind),
      cost: item.light.cost,
      on: state.on,
      color: state.color,
      intensity: state.intensity,
      position: centre.point,
      head: head.point,
      yaw: centre.yaw,
      selected: selected.has(object.id),
    });
  }
  return luminaires;
}
