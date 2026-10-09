import type { Patch } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Opening, PlacedObject, SceneDocument } from '../domain';
import { buildDocument, buildObject, buildOpening, createFixtureCatalog } from '../testing';
import { checkInvariants, touchedByPatches } from './invariants';

const catalog = createFixtureCatalog();

/** Copies the fixture document and swaps in the given objects/openings (keeping order lists right). */
function withEntities(parts: { objects?: PlacedObject[]; openings?: Opening[] }): SceneDocument {
  const doc = buildDocument();
  const objects = parts.objects ?? Object.values(doc.objects);
  return {
    ...doc,
    objects: Object.fromEntries(objects.map((o) => [o.id, o])),
    objectOrder: objects.map((o) => o.id),
    openings: parts.openings
      ? Object.fromEntries(parts.openings.map((o) => [o.id, o]))
      : doc.openings,
  };
}

const invariantsOf = (doc: SceneDocument) =>
  checkInvariants(doc, catalog).map((violation) => violation.invariant);

describe('checkInvariants', () => {
  it('accepts the fixture document', () => {
    expect(checkInvariants(buildDocument(), catalog)).toEqual([]);
  });

  it('reports structural problems as I1', () => {
    const doc = buildDocument();
    expect(invariantsOf({ ...doc, objectOrder: [] })).toContain('I1');
  });

  it('reports invalid field values (I5, I7) as schema violations', () => {
    const doc = buildDocument();
    const room = Object.values(doc.rooms)[0];
    if (!room) throw new Error('fixture needs a room');
    const tall = { ...doc, rooms: { [room.id]: { ...room, height: 5 } } };
    expect(invariantsOf(tall)).toContain('schema');
    const nan = { ...doc, lighting: { ...doc.lighting, ambient: Number.NaN } };
    expect(invariantsOf(nan)).toContain('schema');
  });

  describe('I2: stacking depth', () => {
    it('allows an object on a floor object but not on a stacked one', () => {
      const desk = buildObject({ id: 'desk' });
      const monitor = buildObject({ id: 'monitor', catalogId: 'monitor.27', parentId: 'desk' });
      const ok = withEntities({ objects: [desk, monitor] });
      expect(checkInvariants(ok, catalog)).toEqual([]);

      const sticker = buildObject({ id: 'sticker', catalogId: 'monitor.27', parentId: 'monitor' });
      expect(invariantsOf(withEntities({ objects: [desk, monitor, sticker] }))).toContain('I2');
    });

    it('rejects cycles', () => {
      const a = buildObject({ id: 'a', parentId: 'b' });
      const b = buildObject({ id: 'b', parentId: 'a' });
      expect(invariantsOf(withEntities({ objects: [a, b] }))).toContain('I2');
    });
  });

  describe('I3: floor footprint inside the room', () => {
    // Fixture room: 4 m (x) × 3 m (z). Desk footprint: 1.2 m × 0.6 m.
    const deskAt = (x: number, z: number, rotationY = 0, scale?: [number, number, number]) =>
      buildObject({
        id: 'desk',
        transform: scale
          ? { position: [x, 0, z], rotationY, scale }
          : { position: [x, 0, z], rotationY },
      });
    const check = (desk: ReturnType<typeof deskAt>) =>
      invariantsOf(withEntities({ objects: [desk] }));

    it('accepts a desk touching the walls and rejects one crossing them', () => {
      expect(check(deskAt(0.6, 0.3))).toEqual([]);
      expect(check(deskAt(3.4, 2.7))).toEqual([]);
      expect(check(deskAt(0.55, 1.5))).toContain('I3');
      expect(check(deskAt(2, 2.75))).toContain('I3');
    });

    it('tolerates 1 mm', () => {
      expect(check(deskAt(0.5995, 1.5))).toEqual([]);
      expect(check(deskAt(0.598, 1.5))).toContain('I3');
    });

    it('uses the rotated footprint and the scale', () => {
      // Rotated 90°, the desk is 0.6 m wide along x and 1.2 m along z.
      expect(check(deskAt(0.3, 1.5, Math.PI / 2))).toEqual([]);
      expect(check(deskAt(0.3, 1.5))).toContain('I3');
      expect(check(deskAt(1, 1.5, 0, [2, 1, 1]))).toContain('I3');
    });

    it('skips objects that are not on the floor or are unknown to the catalog (I6)', () => {
      const shelf = buildObject({
        id: 'shelf',
        catalogId: 'shelf.wall',
        transform: { position: [0, 1.5, 0], rotationY: 0 },
      });
      const unknown = buildObject({
        id: 'ghost',
        catalogId: 'removed.item',
        transform: { position: [-5, 0, -5], rotationY: 0 },
      });
      expect(checkInvariants(withEntities({ objects: [shelf, unknown] }), catalog)).toEqual([]);
    });
  });

  describe('I4: openings inside their wall without overlapping', () => {
    const check = (...openings: ReturnType<typeof buildOpening>[]) =>
      invariantsOf(withEntities({ openings }));

    it('accepts openings that fit, including ones that touch', () => {
      const a = buildOpening({ id: 'a', wall: 'north', offset: 0.1, width: 1 });
      const b = buildOpening({ id: 'b', wall: 'north', offset: 1.1, width: 2.8 });
      expect(check(a, b)).toEqual([]);
    });

    it('rejects openings past the end of the wall or above the ceiling', () => {
      // North wall is 4 m long, east wall 3 m; the room is 2.6 m high.
      expect(check(buildOpening({ wall: 'north', offset: 3.5, width: 0.9 }))).toContain('I4');
      // 10 cm of wall must remain at each corner.
      expect(check(buildOpening({ wall: 'north', offset: 0.05, width: 0.9 }))).toContain('I4');
      expect(check(buildOpening({ wall: 'north', offset: 3.05, width: 0.9 }))).toContain('I4');
      expect(check(buildOpening({ wall: 'east', offset: 2.5, width: 0.9 }))).toContain('I4');
      expect(check(buildOpening({ kind: 'window', sill: 1.5, height: 1.2 }))).toContain('I4');
    });

    it('rejects overlapping openings on the same wall only', () => {
      const a = buildOpening({ id: 'a', wall: 'south', offset: 0.5, width: 1 });
      const b = buildOpening({ id: 'b', wall: 'south', offset: 1.2, width: 1 });
      const c = buildOpening({ id: 'c', wall: 'north', offset: 1.2, width: 1 });
      expect(check(a, b)).toContain('I4');
      expect(check(a, c)).toEqual([]);
    });
  });

  it('validates fields only of touched entities when a scope is given', () => {
    const doc = buildDocument();
    const desk = doc.objects['desk-1' as keyof typeof doc.objects];
    if (!desk) throw new Error('fixture needs desk-1');
    const broken = withEntities({
      objects: [
        { ...desk, transform: { position: [2, Number.NaN, 1.5], rotationY: 0 } },
        ...Object.values(doc.objects).filter((o) => o.id !== desk.id),
      ],
    });
    const scope = touchedByPatches([{ op: 'replace', path: ['lighting', 'mode'], value: 'night' }]);
    expect(checkInvariants(broken, catalog, scope).some((v) => v.invariant === 'schema')).toBe(
      false,
    );
    expect(invariantsOf(broken)).toContain('schema');
  });
});

describe('touchedByPatches', () => {
  it('collects the entities and sections a set of patches touches', () => {
    const patches: Patch[] = [
      { op: 'replace', path: ['objects', 'o1', 'transform', 'position', 0], value: 1 },
      { op: 'add', path: ['rooms', 'r1'], value: {} },
      { op: 'replace', path: ['lighting', 'ambient'], value: 0.2 },
      { op: 'add', path: ['objectOrder', 1], value: 'o1' },
    ];
    const scope = touchedByPatches(patches);
    expect(scope).toEqual({
      full: false,
      lighting: true,
      rooms: new Set(['r1']),
      openings: new Set(),
      objects: new Set(['o1']),
    });
  });

  it('falls back to a full check when a whole section is replaced', () => {
    expect(touchedByPatches([{ op: 'replace', path: ['objects'], value: {} }]).full).toBe(true);
    expect(touchedByPatches([{ op: 'replace', path: [], value: {} }]).full).toBe(true);
  });
});
