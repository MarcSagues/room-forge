/** Which camera frames the scene: the orbiting perspective view or the orthographic plan view. */
export const VIEW_MODES = ['perspective', 'top'] as const;

export type ViewMode = (typeof VIEW_MODES)[number];
