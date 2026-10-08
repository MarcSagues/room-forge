/**
 * Validation limits of the MVP domain (DOMAIN_MODEL §5). They bound untrusted input (imports,
 * share links) as well as editing; commands and UI read them from here.
 */
export const LIMITS = {
  /** Room width and depth, in metres. */
  roomSide: { min: 2, max: 12 },
  /** Room height, in metres. */
  roomHeight: { min: 2.2, max: 4 },
  maxRooms: 16,
  maxObjects: 300,
  maxOpeningsPerWall: 6,
  maxNameLength: 80,
  maxImportBytes: 5 * 1024 * 1024,
  /** Any position coordinate, in metres from the room origin. */
  maxCoordinate: 100,
  maxScale: 10,
  maxEffectSpeed: 10,
  maxPaletteColors: 8,
  maxMaterialSlots: 16,
  maxParams: 32,
  /** Slot ids, param keys, preset and catalog ids. */
  maxKeyLength: 80,
  maxParamStringLength: 200,
} as const;
