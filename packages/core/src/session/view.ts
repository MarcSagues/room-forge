/** Which camera frames the scene: the orbiting perspective view or the orthographic plan view. */
export const VIEW_MODES = ['perspective', 'top'] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

/**
 * How walls are drawn (the Sims convention): `up` all opaque, `cutaway` the walls between the
 * camera and the room fade out, `down` every wall is cut low so the floor plan reads clearly.
 */
export const WALL_MODES = ['up', 'cutaway', 'down'] as const;

export type WallMode = (typeof WALL_MODES)[number];

/** The `W` shortcut: up → cutaway → down → up. */
export function nextWallMode(mode: WallMode): WallMode {
  return WALL_MODES[(WALL_MODES.indexOf(mode) + 1) % WALL_MODES.length] as WallMode;
}
