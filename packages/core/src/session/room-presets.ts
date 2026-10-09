/** The size of a rectangular room, in metres. */
export interface RoomSize {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/**
 * A starting size offered when a project is created (PRD FR-ROOM-01). Like the material presets
 * these are app data: a document only stores the size that was chosen.
 */
export interface RoomPreset extends RoomSize {
  readonly id: 'small' | 'office' | 'gaming';
  readonly name: { readonly en: string; readonly es: string };
}

export const ROOM_PRESETS: readonly RoomPreset[] = [
  { id: 'small', name: { en: 'Small', es: 'Pequeña' }, width: 3, depth: 3, height: 2.6 },
  { id: 'office', name: { en: 'Office', es: 'Despacho' }, width: 4, depth: 3.5, height: 2.6 },
  { id: 'gaming', name: { en: 'Gaming', es: 'Gaming' }, width: 4, depth: 4.5, height: 2.6 },
];

/** What a project starts with when nobody chooses a size. */
export const DEFAULT_ROOM_SIZE: RoomSize = { width: 4, depth: 4.5, height: 2.6 };
