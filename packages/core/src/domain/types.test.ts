import { describe, expectTypeOf, it } from 'vitest';
import type { CatalogId, ObjectId, OpeningId, RoomId } from './ids';
import type {
  HexColor,
  Lighting,
  LightState,
  MaterialRef,
  Opening,
  PlacedObject,
  Room,
  SceneDocument,
  Surface,
  Vec2,
  Vec3,
  WallId,
} from './schemas';

// The types documented in DOMAIN_MODEL §3, written out by hand. If a schema drifts from the
// specification, `tsc` fails here (vitest only runs the empty bodies).
type DocMaterialRef = { presetId: string; tint?: HexColor; roughness?: number; metalness?: number };
type DocSurface = { material: DocMaterialRef };
type DocRoom = {
  id: RoomId;
  name: string;
  shape: { kind: 'rect'; width: number; depth: number };
  height: number;
  origin: [number, number];
  floor: DocSurface;
  ceiling: DocSurface;
  walls: Record<WallId, DocSurface>;
};
type DocOpening = {
  id: OpeningId;
  roomId: RoomId;
  wall: WallId;
  kind: 'door' | 'window';
  variant: string;
  offset: number;
  width: number;
  height: number;
  sill: number;
};
type DocLightState = {
  on: boolean;
  color: HexColor;
  intensity: number;
  effect:
    | { kind: 'static' }
    | { kind: 'breathing'; speed: number }
    | { kind: 'cycle'; speed: number; palette?: HexColor[] };
};
type DocPlacedObject = {
  id: ObjectId;
  catalogId: CatalogId;
  name?: string;
  roomId: RoomId;
  parentId: ObjectId | null;
  transform: {
    position: [number, number, number];
    rotationY: number;
    scale?: [number, number, number];
  };
  materials: Record<string, DocMaterialRef>;
  light?: DocLightState;
  params?: Record<string, number | string | boolean>;
  locked: boolean;
  hidden: boolean;
};
type DocLighting = { mode: 'day' | 'night'; ambient: number; sunAzimuth: number };
type DocSceneDocument = {
  schemaVersion: 1;
  units: 'm';
  rooms: Record<RoomId, DocRoom>;
  roomOrder: RoomId[];
  openings: Record<OpeningId, DocOpening>;
  objects: Record<ObjectId, DocPlacedObject>;
  objectOrder: ObjectId[];
  lighting: DocLighting;
};

describe('inferred types match DOMAIN_MODEL §3', () => {
  it('compiles', () => {
    expectTypeOf<Vec2>().toEqualTypeOf<[number, number]>();
    expectTypeOf<Vec3>().toEqualTypeOf<[number, number, number]>();
    expectTypeOf<MaterialRef>().toEqualTypeOf<DocMaterialRef>();
    expectTypeOf<Surface>().toEqualTypeOf<DocSurface>();
    expectTypeOf<Room>().toEqualTypeOf<DocRoom>();
    expectTypeOf<Opening>().toEqualTypeOf<DocOpening>();
    expectTypeOf<LightState>().toEqualTypeOf<DocLightState>();
    expectTypeOf<PlacedObject>().toEqualTypeOf<DocPlacedObject>();
    expectTypeOf<Lighting>().toEqualTypeOf<DocLighting>();
    expectTypeOf<SceneDocument>().toEqualTypeOf<DocSceneDocument>();
  });

  it('keeps ids of different entities apart (brands)', () => {
    expectTypeOf<RoomId>().not.toEqualTypeOf<ObjectId>();
    expectTypeOf<string>().not.toExtend<RoomId>();
  });
});
