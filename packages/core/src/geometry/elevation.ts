/**
 * Elevation of a floor object (P3-16): the height of its base above the floor, in metres. Pure and
 * allocation-free, so the drag controllers can call it.
 */

/**
 * The highest legal elevation: where the top of an object `itemHeight` tall (times `scaleY`)
 * touches the ceiling of a room `roomHeight` tall. The lowest is always 0 (the floor). Never
 * negative, even for an object taller than the room.
 */
export function maxElevation(roomHeight: number, itemHeight: number, scaleY = 1): number {
  return Math.max(0, roomHeight - itemHeight * scaleY);
}

/** `elevation` kept between the floor and `max`. */
export function clampElevation(elevation: number, max: number): number {
  return Math.min(Math.max(elevation, 0), max);
}
