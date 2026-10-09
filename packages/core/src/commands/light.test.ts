import { describe, expect, it } from 'vitest';
import {
  type LightState,
  LightStateSchema,
  type ObjectId,
  type PlacedObject,
  type SceneDocument,
} from '../domain';
import { AMBIENCE_PRESETS, getAmbiencePreset } from '../lighting';
import { createEditorSession, type EditorSession } from '../session';
import {
  buildDocument,
  buildObject,
  createFakeClock,
  createFixtureCatalog,
  createSeqIdGen,
} from '../testing';
import { setAllLights, setLight, setLightingMode } from './light';

// led.strip.1m can light up (default colour white); desk.basic.120 cannot.
const DESK = 'desk-1' as ObjectId;
const strip = (n: number): ObjectId => `strip-${n}` as ObjectId;

function documentWithStrips(count: number): SceneDocument {
  const base = buildDocument();
  const objects = { ...base.objects } as Record<string, PlacedObject>;
  const order = [...base.objectOrder];
  for (let i = 0; i < count; i += 1) {
    const object = buildObject({
      id: strip(i),
      catalogId: 'led.strip.1m',
      transform: { position: [0.5 + i * 0.4, 0, 0.3], rotationY: 0 },
    });
    objects[object.id] = object;
    order.push(object.id);
  }
  return { ...base, objects: objects as SceneDocument['objects'], objectOrder: order };
}

function setup(document: SceneDocument = documentWithStrips(8)) {
  const clock = createFakeClock(0);
  const session = createEditorSession({
    initialDocument: document,
    catalog: createFixtureCatalog(),
    idGen: createSeqIdGen('o'),
    clock,
  });
  return { session, clock };
}

const light = (session: EditorSession, id: ObjectId) =>
  session.getState().document.objects[id]?.light;
const WHITE_STATIC: LightState = {
  on: true,
  color: '#ffffff',
  intensity: 1,
  effect: { kind: 'static' },
};

describe('light/set', () => {
  it('gives a light its first state from the item defaults plus the change, and undo takes it away', () => {
    const { session } = setup();
    const result = session.execute(setLight([strip(0)], { color: '#ff00aa', intensity: 0.6 }));
    expect(result.ok).toBe(true);
    expect(light(session, strip(0))).toEqual({
      ...WHITE_STATIC,
      color: '#ff00aa',
      intensity: 0.6,
    });
    expect(session.getState().history.undoLabel).toBe('Change light');
    session.undo();
    expect(light(session, strip(0))).toBeUndefined();
    session.redo();
    expect(light(session, strip(0))?.color).toBe('#ff00aa');
  });

  it('changes only what it is told to and replaces the effect as a whole', () => {
    const { session } = setup();
    session.execute(
      setLight([strip(0)], { color: '#112233', effect: { kind: 'breathing', speed: 2 } }),
    );
    session.execute(setLight([strip(0)], { on: false }));
    expect(light(session, strip(0))).toEqual({
      on: false,
      color: '#112233',
      intensity: 1,
      effect: { kind: 'breathing', speed: 2 },
    });
    session.execute(
      setLight([strip(0)], {
        effect: { kind: 'cycle', speed: 1, palette: ['#ff0000', '#0000ff'] },
      }),
    );
    expect(light(session, strip(0))?.effect).toEqual({
      kind: 'cycle',
      speed: 1,
      palette: ['#ff0000', '#0000ff'],
    });
  });

  it('changes several lights in one entry', () => {
    const { session } = setup();
    session.execute(setLight([strip(0), strip(1), strip(2)], { on: false }));
    for (const n of [0, 1, 2]) expect(light(session, strip(n))?.on).toBe(false);
    expect(light(session, strip(3))).toBeUndefined();
    session.undo();
    expect(light(session, strip(1))).toBeUndefined();
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('refuses an item that cannot light up, and all the others with it', () => {
    const { session } = setup();
    const before = session.getState().document;
    const result = session.execute(setLight([strip(0), DESK], { on: false }));
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid' } });
    if (!result.ok) expect(result.error.message).toMatch(/desk\.basic\.120.*light/);
    expect(session.getState().document).toBe(before);
  });

  it('accepts an item the catalog does not know (invariant I6)', () => {
    const base = documentWithStrips(0);
    const mystery = buildObject({ id: 'mystery', catalogId: 'lamp.from.the.future' });
    const objects = { ...base.objects } as Record<string, PlacedObject>;
    objects.mystery = mystery;
    const { session } = setup({
      ...base,
      objects: objects as SceneDocument['objects'],
      objectOrder: [...base.objectOrder, mystery.id],
    });
    expect(session.execute(setLight([mystery.id], { on: true })).ok).toBe(true);
    expect(light(session, mystery.id)).toEqual(WHITE_STATIC);
  });

  it('refuses values out of range, a colour that is not hex, a bad effect, nothing to change', () => {
    const { session } = setup();
    const before = session.getState().document;
    const bad = [
      { color: 'red' },
      { color: '#fff' },
      { intensity: 1.2 },
      { intensity: -0.1 },
      { effect: { kind: 'breathing', speed: 0 } },
      { effect: { kind: 'breathing', speed: 11 } },
      { effect: { kind: 'cycle', speed: 1, palette: [] } },
      { effect: { kind: 'cycle', speed: 1, palette: Array(9).fill('#ffffff') } },
      { effect: { kind: 'strobe', speed: 1 } },
      { on: 'yes' },
      {},
    ];
    for (const patch of bad) {
      const result = session.execute(setLight([strip(0)], patch as never));
      expect(result.ok, JSON.stringify(patch)).toBe(false);
    }
    expect(session.getState().document).toBe(before);
  });

  it('fails cleanly for an object that does not exist, or no objects at all', () => {
    const { session } = setup();
    expect(session.execute(setLight(['nope' as ObjectId], { on: false }))).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(session.execute(setLight([], { on: false }))).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
  });

  it('merges a burst of colour edits (a colour picker) into one entry', () => {
    const { session, clock } = setup();
    for (const color of ['#111111', '#222222', '#333333'] as const) {
      session.execute(setLight([strip(0)], { color }));
      clock.advance(40);
    }
    expect(light(session, strip(0))?.color).toBe('#333333');
    session.undo();
    expect(light(session, strip(0))).toBeUndefined();
    expect(session.getState().history.canUndo).toBe(false);
  });
});

describe('light/setAll', () => {
  it('turns every light off or on in one entry, and leaves what cannot light up alone', () => {
    const { session } = setup();
    expect(session.execute(setAllLights({ on: false })).ok).toBe(true);
    for (let n = 0; n < 8; n += 1) expect(light(session, strip(n))?.on).toBe(false);
    expect(light(session, DESK)).toBeUndefined();
    expect(session.getState().history.undoLabel).toBe('Change all lights');

    session.execute(setAllLights({ on: true }));
    for (let n = 0; n < 8; n += 1) expect(light(session, strip(n))?.on).toBe(true);

    session.undo();
    session.undo();
    for (let n = 0; n < 8; n += 1) expect(light(session, strip(n))).toBeUndefined();
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('applies an ambience preset to 8 lights as one history entry', () => {
    const { session } = setup();
    const preset = getAmbiencePreset('cyberpunk');
    if (!preset) throw new Error('missing preset');
    expect(session.execute(setAllLights({ preset })).ok).toBe(true);
    expect(session.getState().history.canUndo).toBe(true);
    // States are dealt out in order and wrap around.
    for (let n = 0; n < 8; n += 1) {
      expect(light(session, strip(n))).toEqual(preset.states[n % preset.states.length]);
    }
    session.undo();
    for (let n = 0; n < 8; n += 1) expect(light(session, strip(n))).toBeUndefined();
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('keeps every light independent: changing one afterwards does not touch the others', () => {
    const { session } = setup();
    const preset = getAmbiencePreset('warm');
    if (!preset) throw new Error('missing preset');
    session.execute(setAllLights({ preset }));
    session.execute(setLight([strip(0)], { color: '#000001' }));
    expect(light(session, strip(0))?.color).toBe('#000001');
    expect(light(session, strip(preset.states.length))?.color).toBe(preset.states[0]?.color);
  });

  it('includes a light of an item the catalog does not know once it has a state', () => {
    const base = documentWithStrips(1);
    const mystery = buildObject({
      id: 'mystery',
      catalogId: 'lamp.from.the.future',
      light: WHITE_STATIC,
    });
    const objects = { ...base.objects } as Record<string, PlacedObject>;
    objects.mystery = mystery;
    const { session } = setup({
      ...base,
      objects: objects as SceneDocument['objects'],
      objectOrder: [...base.objectOrder, mystery.id],
    });
    session.execute(setAllLights({ on: false }));
    expect(light(session, mystery.id)?.on).toBe(false);
    expect(light(session, strip(0))?.on).toBe(false);
  });

  it('fails when there is no light in the scene', () => {
    const { session } = setup(documentWithStrips(0));
    const before = session.getState().document;
    expect(session.execute(setAllLights({ on: true }))).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    expect(session.getState().document).toBe(before);
  });
});

describe('scene/setLightingMode', () => {
  it('switches between day and night, with undo', () => {
    const { session } = setup();
    expect(session.getState().document.lighting.mode).toBe('day');
    expect(session.execute(setLightingMode('night')).ok).toBe(true);
    expect(session.getState().document.lighting.mode).toBe('night');
    expect(session.getState().history.undoLabel).toBe('Change lighting mode');
    session.undo();
    expect(session.getState().document.lighting.mode).toBe('day');
  });

  it('refuses any other mode', () => {
    const { session } = setup();
    expect(session.execute(setLightingMode('dusk' as never))).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
  });
});

describe('ambience presets', () => {
  it('has the four of the brief, named in English and Spanish', () => {
    for (const id of ['cyberpunk', 'sunset', 'warm', 'cool']) {
      const preset = getAmbiencePreset(id);
      expect(preset, id).toBeDefined();
      expect(preset?.name.en.length).toBeGreaterThan(2);
      expect(preset?.name.es.length).toBeGreaterThan(2);
    }
    expect(getAmbiencePreset('nope')).toBeUndefined();
    expect(AMBIENCE_PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it('is made of valid light states', () => {
    for (const preset of AMBIENCE_PRESETS) {
      expect(preset.states.length, preset.id).toBeGreaterThan(0);
      for (const state of preset.states) {
        expect(LightStateSchema.safeParse(state).success, preset.id).toBe(true);
      }
    }
  });
});
