import { SCHEMA_VERSION, type SceneDocument } from './schemas';

/** Default lighting of a new scene: daylight with soft ambient and the sun from the south-east. */
export const DEFAULT_LIGHTING = { mode: 'day', ambient: 0.4, sunAzimuth: 135 } as const;

/** A valid document with no rooms yet; the room is added by a command (P2-04). */
export function createEmptyDocument(): SceneDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    units: 'm',
    rooms: {},
    roomOrder: [],
    openings: {},
    objects: {},
    objectOrder: [],
    lighting: { ...DEFAULT_LIGHTING },
  };
}
