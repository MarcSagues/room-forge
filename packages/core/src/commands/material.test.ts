import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  type MaterialRef,
  type ObjectId,
  type RoomId,
  type SceneDocument,
} from '../domain';
import { createEditorSession, type EditorSession } from '../session';
import {
  buildDocument,
  buildObject,
  createFakeClock,
  createFixtureCatalog,
  createSeqIdGen,
} from '../testing';
import { resetObjectMaterial, setObjectMaterial } from './material';
import { type RoomSurface, setSurfaceMaterial } from './room';

// Fixture room 4 × 3; desk-1 (desk.basic.120: slots "top" and "frame") with monitor-1 (no slots).
const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;
const ROOM = 'room-1' as RoomId;

function setup(initialDocument: SceneDocument = buildDocument()) {
  const clock = createFakeClock(0);
  const session = createEditorSession({
    initialDocument,
    catalog: createFixtureCatalog(),
    idGen: createSeqIdGen('obj'),
    clock,
  });
  return { session, clock };
}

const materials = (session: EditorSession, id: ObjectId) =>
  session.getState().document.objects[id]?.materials;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('object/setMaterial', () => {
  it('puts a material in a slot of the catalog item, and undo and redo bring it and take it away', () => {
    const { session } = setup();
    const oak: MaterialRef = { presetId: 'wood.oak', tint: '#aa7744', roughness: 0.3 };
    expect(session.execute(setObjectMaterial([DESK], 'top', oak)).ok).toBe(true);
    expect(materials(session, DESK)).toEqual({ top: oak });
    expect(session.getState().history).toMatchObject({
      canUndo: true,
      undoLabel: 'Change material',
    });

    session.undo();
    expect(materials(session, DESK)).toEqual({});
    session.redo();
    expect(materials(session, DESK)).toEqual({ top: oak });
  });

  it('changes the same slot of several objects in one entry', () => {
    const document = buildDocument();
    const other = buildObject({ id: 'desk-2', transform: { position: [1, 0, 1], rotationY: 0 } });
    const objects = { ...document.objects } as Record<string, typeof other>;
    objects['desk-2'] = other;
    const { session } = setup({
      ...document,
      objects: objects as SceneDocument['objects'],
      objectOrder: [...document.objectOrder, other.id],
    });
    const result = session.execute(
      setObjectMaterial([DESK, other.id], 'frame', { presetId: 'metal.black' }),
    );
    expect(result.ok).toBe(true);
    expect(materials(session, DESK)).toEqual({ frame: { presetId: 'metal.black' } });
    expect(materials(session, other.id)).toEqual({ frame: { presetId: 'metal.black' } });
    session.undo();
    expect(materials(session, DESK)).toEqual({});
    expect(materials(session, other.id)).toEqual({});
  });

  it('refuses a slot the catalog item does not have, and an item with no slots, changing nothing', () => {
    const { session } = setup();
    const before = session.getState().document;
    const wrongSlot = session.execute(setObjectMaterial([DESK], 'lid', { presetId: 'wood.oak' }));
    expect(wrongSlot).toMatchObject({ ok: false, error: { code: 'invalid' } });
    if (!wrongSlot.ok) expect(wrongSlot.error.message).toMatch(/slot "lid"/);
    const noSlots = session.execute(setObjectMaterial([MONITOR], 'top', { presetId: 'wood.oak' }));
    expect(noSlots).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(session.getState().document).toBe(before);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('accepts any slot on an item the catalog does not know (invariant I6)', () => {
    const document = buildDocument();
    const mystery = buildObject({ id: 'mystery', catalogId: 'sofa.from.the.future' });
    const objects = { ...document.objects } as Record<string, typeof mystery>;
    objects.mystery = mystery;
    const { session } = setup({
      ...document,
      objects: objects as SceneDocument['objects'],
      objectOrder: [...document.objectOrder, mystery.id],
    });
    const result = session.execute(
      setObjectMaterial([mystery.id], 'cushion', { presetId: 'fabric.grey' }),
    );
    expect(result.ok).toBe(true);
    expect(materials(session, mystery.id)).toEqual({ cushion: { presetId: 'fabric.grey' } });
  });

  it('keeps a preset id this version does not know (invariant I6)', () => {
    const { session } = setup();
    const result = session.execute(setObjectMaterial([DESK], 'top', { presetId: 'wood.future' }));
    expect(result.ok).toBe(true);
    expect(materials(session, DESK)?.top?.presetId).toBe('wood.future');
  });

  it('refuses a tint that is not a hex colour, values outside 0..1 and an empty preset id', () => {
    const { session } = setup();
    const before = session.getState().document;
    const bad: unknown[] = [
      { presetId: 'wood.oak', tint: 'red' },
      { presetId: 'wood.oak', tint: '#12345' },
      { presetId: 'wood.oak', roughness: 1.5 },
      { presetId: 'wood.oak', roughness: -0.1 },
      { presetId: 'wood.oak', metalness: 2 },
      { presetId: '' },
      { presetId: 'x'.repeat(LIMITS.maxKeyLength + 1) },
    ];
    for (const material of bad) {
      const result = session.execute(setObjectMaterial([DESK], 'top', material as MaterialRef));
      expect(result.ok, JSON.stringify(material)).toBe(false);
    }
    expect(session.getState().document).toBe(before);
  });

  it('refuses a slot id that is not a valid key', () => {
    const { session } = setup();
    for (const slot of ['', 'x'.repeat(LIMITS.maxKeyLength + 1)]) {
      expect(session.execute(setObjectMaterial([DESK], slot, { presetId: 'wood.oak' })).ok).toBe(
        false,
      );
    }
  });

  it('fails cleanly for an object that does not exist, or no objects at all', () => {
    const { session } = setup();
    expect(
      session.execute(setObjectMaterial(['nope' as ObjectId], 'top', { presetId: 'wood.oak' })),
    ).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(session.execute(setObjectMaterial([], 'top', { presetId: 'wood.oak' }))).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
  });

  it('refuses a slot beyond the most an object can hold', () => {
    const document = buildDocument();
    const full = buildObject({
      id: 'full',
      catalogId: 'unknown.item',
      transform: { position: [1, 0, 1], rotationY: 0 },
      materials: Object.fromEntries(
        Array.from({ length: LIMITS.maxMaterialSlots }, (_, i) => [
          `s${i}`,
          { presetId: 'paint.matte' },
        ]),
      ),
    });
    const objects = { ...document.objects } as Record<string, typeof full>;
    objects.full = full;
    const { session } = setup({
      ...document,
      objects: objects as SceneDocument['objects'],
      objectOrder: [...document.objectOrder, full.id],
    });
    expect(
      session.execute(setObjectMaterial([full.id], 'extra', { presetId: 'wood.oak' })),
    ).toMatchObject({ ok: false, error: { code: 'limit-reached' } });
    // Changing a slot it already has is fine.
    expect(session.execute(setObjectMaterial([full.id], 's3', { presetId: 'wood.oak' })).ok).toBe(
      true,
    );
  });

  it('merges a burst of edits to one slot (a colour picker) into one entry, but not another slot', () => {
    const { session, clock } = setup();
    for (const tint of ['#111111', '#222222', '#333333'] as const) {
      session.execute(setObjectMaterial([DESK], 'top', { presetId: 'wood.oak', tint }));
      clock.advance(50);
    }
    session.execute(setObjectMaterial([DESK], 'frame', { presetId: 'metal.black' }));
    expect(materials(session, DESK)?.top?.tint).toBe('#333333');
    session.undo();
    expect(materials(session, DESK)).toEqual({ top: { presetId: 'wood.oak', tint: '#333333' } });
    session.undo();
    expect(materials(session, DESK)).toEqual({});
    expect(session.getState().history.canUndo).toBe(false);
  });
});

describe('object/resetMaterial', () => {
  it('takes the override away so the item shows its own default again, and undo puts it back', () => {
    const { session } = setup();
    session.execute(setObjectMaterial([DESK], 'top', { presetId: 'wood.walnut' }));
    expect(session.execute(resetObjectMaterial([DESK], 'top')).ok).toBe(true);
    expect(materials(session, DESK)).toEqual({});
    expect(session.getState().history.undoLabel).toBe('Reset material');
    session.undo();
    expect(materials(session, DESK)).toEqual({ top: { presetId: 'wood.walnut' } });
  });

  it('is fine when the slot had no override, and fails for a missing object', () => {
    const { session } = setup();
    expect(session.execute(resetObjectMaterial([DESK], 'top')).ok).toBe(true);
    expect(session.execute(resetObjectMaterial(['nope' as ObjectId], 'top'))).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
  });
});

describe('room surfaces take the same material fields', () => {
  it('floor, ceiling and each wall accept a preset with tint, roughness and metalness, with undo', () => {
    const { session } = setup();
    const surfaces: RoomSurface[] = ['floor', 'ceiling', 'north', 'east', 'south', 'west'];
    for (const surface of surfaces) {
      const material: MaterialRef = {
        presetId: 'paint.sage',
        tint: '#445566',
        roughness: 0.4,
        metalness: 0.1,
      };
      expect(session.execute(setSurfaceMaterial(ROOM, surface, material)).ok).toBe(true);
    }
    const room = session.getState().document.rooms[ROOM];
    expect(room?.floor.material).toMatchObject({ presetId: 'paint.sage', tint: '#445566' });
    expect(room?.walls.west.material.roughness).toBe(0.4);
    for (let i = 0; i < surfaces.length; i += 1) session.undo();
    expect(session.getState().document.rooms[ROOM]?.floor.material).toEqual({
      presetId: 'floor.oak',
    });
  });
});

describe('undo and redo of material commands (property)', () => {
  const preset = fc.constantFrom('wood.oak', 'paint.matte', 'metal.steel', 'unknown.preset');
  const hex = fc
    .integer({ min: 0, max: 0xffffff })
    .map((n) => `#${n.toString(16).padStart(6, '0')}` as `#${string}`);
  const unit = fc.double({ min: 0, max: 1, noNaN: true }).map((n) => (n === 0 ? 0 : n));
  const material: fc.Arbitrary<MaterialRef> = fc.record(
    { presetId: preset, tint: hex, roughness: unit, metalness: unit },
    { requiredKeys: ['presetId'] },
  );
  const command = fc.oneof(
    fc.record({
      kind: fc.constant('set' as const),
      slot: fc.constantFrom('top', 'frame', 'nope'),
      material,
    }),
    fc.record({ kind: fc.constant('reset' as const), slot: fc.constantFrom('top', 'frame') }),
    fc.record({
      kind: fc.constant('surface' as const),
      surface: fc.constantFrom<RoomSurface>('floor', 'ceiling', 'north', 'south'),
      material,
    }),
  );

  it('undoing everything restores the document, redoing everything restores the result', () => {
    fc.assert(
      fc.property(fc.array(command, { maxLength: 15 }), fc.boolean(), (commands, burst) => {
        const { session, clock } = setup();
        const original = copy(session.getState().document);
        for (const item of commands) {
          if (item.kind === 'set')
            session.execute(setObjectMaterial([DESK], item.slot, item.material));
          else if (item.kind === 'reset') session.execute(resetObjectMaterial([DESK], item.slot));
          else session.execute(setSurfaceMaterial(ROOM, item.surface, item.material));
          clock.advance(burst ? 10 : 10_000); // sometimes within the merge window, sometimes not
        }
        const result = copy(session.getState().document);
        while (session.getState().history.canUndo) session.undo();
        expect(copy(session.getState().document)).toEqual(original);
        while (session.getState().history.canRedo) session.redo();
        expect(copy(session.getState().document)).toEqual(result);
      }),
      { numRuns: 100 },
    );
  });
});
