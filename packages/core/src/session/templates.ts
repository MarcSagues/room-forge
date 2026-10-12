import { setLight, setLightingMode } from '../commands/light';
import { addObject } from '../commands/object';
import { addOpening, type OpeningVariant } from '../commands/opening';
import { createRoom } from '../commands/room';
import type { HexColor, LightState, ObjectId, RoomId, SceneDocument, WallId } from '../domain';
import { createEmptyDocument } from '../domain';
import { solvePlacement } from '../geometry';
import type { CatalogProvider } from '../ports';
import { DEFAULT_ROOM_SIZE, type RoomSize } from './room-presets';
import { createEditorSession, type EditorSession } from './session';
import type { Command } from './types';

export const TEMPLATE_IDS = ['empty', 'gaming', 'office', 'streaming'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** An object of a template: where it stands in the room (room-local metres) and how it glows. */
export interface TemplateObject {
  readonly catalogId: string;
  /** Centre on the floor plane, `[x, z]`, from the room's north-west corner. */
  readonly at: readonly [number, number];
  /** Height of the base above the floor. Things "on the desk" are floor objects raised to its top
   * until tabletop placement exists (#46), so they can still be dragged on their own. */
  readonly y?: number;
  readonly rotationY?: number;
  /** Snapped to the nearest wall with the editor's own rule: back to it, facing the room. */
  readonly againstWall?: boolean;
  readonly light?: LightState;
}

export interface TemplateOpening {
  readonly wall: WallId;
  readonly variant: OpeningVariant;
  readonly offset: number;
}

/** A starting point offered when a project is created (P8-02). Its names live in the UI. */
export interface StarterTemplate {
  readonly id: TemplateId;
  readonly size: RoomSize;
  readonly lighting: 'day' | 'night';
  readonly openings: readonly TemplateOpening[];
  readonly objects: readonly TemplateObject[];
}

const glow = (
  color: HexColor,
  intensity: number,
  effect: LightState['effect'] = { kind: 'static' },
): LightState => ({ on: true, color, intensity, effect });

const DESK_TOP = 0.75;
const OFFICE_DESK_TOP = 0.74;
const FACING_NORTH = Math.PI;

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  { id: 'empty', size: DEFAULT_ROOM_SIZE, lighting: 'day', openings: [], objects: [] },
  {
    id: 'gaming',
    size: { width: 4, depth: 4.5, height: 2.6 },
    lighting: 'night',
    openings: [{ wall: 'south', variant: 'door.single', offset: 2.6 }],
    objects: [
      { catalogId: 'desk.gaming.160', at: [2, 0.05], againstWall: true },
      { catalogId: 'monitor.ultrawide.34.curved', at: [2, 0.2], y: DESK_TOP },
      {
        catalogId: 'light.bars.pair',
        at: [1.35, 0.2],
        y: DESK_TOP,
        light: glow('#22d3ee', 0.9),
      },
      { catalogId: 'chair.gaming.racing', at: [2, 1.25], rotationY: FACING_NORTH },
      {
        catalogId: 'panel.hex.cluster',
        at: [3.1, 0.05],
        y: 1.45,
        againstWall: true,
        light: glow('#ff2bd6', 0.9, { kind: 'breathing', speed: 0.6 }),
      },
      {
        catalogId: 'led.strip.1m',
        at: [2, 0.05],
        y: 2.35,
        againstWall: true,
        light: glow('#8b5cf6', 0.8, {
          kind: 'cycle',
          speed: 0.5,
          palette: ['#8b5cf6', '#19e6ff', '#ff2bd6'],
        }),
      },
      { catalogId: 'lamp.floor.cone', at: [3.55, 1.1], light: glow('#ffb870', 0.5) },
    ],
  },
  {
    id: 'office',
    size: { width: 4, depth: 3.5, height: 2.6 },
    lighting: 'day',
    openings: [
      { wall: 'north', variant: 'window.standard', offset: 1.5 },
      { wall: 'east', variant: 'door.single', offset: 2.2 },
    ],
    objects: [
      { catalogId: 'desk.office.140', at: [2, 0.05], againstWall: true },
      { catalogId: 'monitor.27.arm', at: [1.85, 0.15], y: OFFICE_DESK_TOP },
      {
        catalogId: 'lamp.desk.arm',
        at: [2.5, 0.3],
        y: OFFICE_DESK_TOP,
        light: glow('#fff2d6', 0.7),
      },
      { catalogId: 'chair.gaming.ergonomic', at: [2, 1.1], rotationY: FACING_NORTH },
      { catalogId: 'lamp.floor.cone', at: [0.4, 3.1], light: glow('#ffd29e', 0.6) },
    ],
  },
  {
    id: 'streaming',
    size: { width: 3.5, depth: 3, height: 2.6 },
    lighting: 'night',
    openings: [{ wall: 'south', variant: 'door.single', offset: 2.2 }],
    objects: [
      { catalogId: 'desk.studio.160', at: [1.2, 0.05], againstWall: true },
      { catalogId: 'monitor.27.flat', at: [0.88, 0.2], y: DESK_TOP },
      { catalogId: 'monitor.27.flat', at: [1.52, 0.2], y: DESK_TOP },
      { catalogId: 'chair.gaming.padded', at: [1.2, 1.2], rotationY: FACING_NORTH },
      {
        catalogId: 'neon.sign.wave',
        at: [1.2, 0.05],
        y: 1.5,
        againstWall: true,
        light: glow('#ff3d9a', 1),
      },
      {
        catalogId: 'panel.hex.cluster',
        at: [3.45, 1.3],
        y: 1.3,
        againstWall: true,
        light: glow('#8b5cf6', 0.9, {
          kind: 'cycle',
          speed: 0.4,
          palette: ['#ff3d9a', '#8b5cf6', '#19e6ff'],
        }),
      },
      {
        catalogId: 'led.strip.1m',
        at: [0.05, 1.6],
        y: 2.35,
        againstWall: true,
        light: glow('#19e6ff', 0.7, { kind: 'breathing', speed: 0.4 }),
      },
      { catalogId: 'lamp.floor.cone', at: [2.45, 0.45], light: glow('#c9e4ff', 0.8) },
    ],
  },
];

const BY_ID = new Map<string, StarterTemplate>(STARTER_TEMPLATES.map((entry) => [entry.id, entry]));

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && BY_ID.has(value);
}

function run(session: EditorSession, command: Command, what: string): void {
  const result = session.execute(command);
  if (!result.ok) throw new Error(`template ${what} rejected: ${result.error.message}`);
}

/** Where a template object goes: as written, or snapped against a wall like a drag would. */
function pose(spec: TemplateObject, size: RoomSize, catalog: CatalogProvider) {
  const rotationY = spec.rotationY ?? 0;
  const item = catalog.getItem(spec.catalogId);
  if (!spec.againstWall || !item) return { x: spec.at[0], z: spec.at[1], rotationY };
  const solved = solvePlacement({
    room: size,
    size: { w: item.size.w, d: item.size.d },
    position: spec.at,
    rotationY,
  });
  if (!solved.wall) throw new Error(`template "${spec.catalogId}" is not near a wall`);
  return { x: solved.position[0], z: solved.position[1], rotationY: solved.rotationY };
}

/**
 * A new project's document from a template, built with the editor's own commands so it passes
 * the same checks as a hand-made room (an item that does not fit throws: the template is wrong).
 * Every call has fresh ids, so a project never shares anything with the template or another one.
 */
export function createTemplateDocument(
  id: TemplateId,
  catalog: CatalogProvider,
  options: { roomName?: string } = {},
): SceneDocument {
  const template = BY_ID.get(id);
  if (!template) throw new Error(`unknown template "${id}"`);
  const session = createEditorSession({ initialDocument: createEmptyDocument(), catalog });
  run(session, createRoom({ name: options.roomName ?? 'Room', ...template.size }), 'room');
  const roomId = session.getState().document.roomOrder[0] as RoomId;

  for (const opening of template.openings) {
    run(session, addOpening({ roomId, ...opening }), opening.variant);
  }
  for (const spec of template.objects) {
    const { x, z, rotationY } = pose(spec, template.size, catalog);
    run(
      session,
      addObject({ catalogId: spec.catalogId, roomId, position: [x, spec.y ?? 0, z], rotationY }),
      spec.catalogId,
    );
    if (spec.light) {
      const objectId = session.getState().document.objectOrder.at(-1) as ObjectId;
      run(session, setLight([objectId], spec.light), `${spec.catalogId} light`);
    }
  }
  if (template.lighting !== 'day') run(session, setLightingMode(template.lighting), 'lighting');
  // The session freezes its document; hand out a copy the caller can use and change freely.
  return JSON.parse(JSON.stringify(session.getState().document)) as SceneDocument;
}
