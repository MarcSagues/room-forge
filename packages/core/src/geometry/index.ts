export {
  ANGLE_STEPS_DEG,
  type BackFace,
  backFaceRotation,
  footprintExtents,
  footprintInside,
  GEOMETRY_TOLERANCE,
  GRID_STEPS,
  intersectRayFloor,
  normalizeAngle,
  snapAngle,
  snapToGrid,
} from './basics';
export { clampElevation, maxElevation } from './elevation';
export {
  intersectRayWall,
  type OpeningOffsetInput,
  type OpeningOffsetReason,
  type OpeningOffsetResult,
  pickWall,
  type RoomBox,
  solveOpeningOffset,
  WALL_PICK_DISTANCE,
  type WallHit,
  wallLength,
  wallPoint,
  wallU,
} from './openings';
export {
  type PlacementGuide,
  type PlacementInput,
  type PlacementReason,
  type PlacementResult,
  solvePlacement,
  WALL_SNAP_DISTANCE,
  type WallGuide,
} from './placement';
