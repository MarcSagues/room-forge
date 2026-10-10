import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type CatalogFileStats,
  type CatalogManifest,
  CatalogManifestSchema,
  DEFAULT_CATALOG_POLICY,
  toCatalogItem,
  validateCatalogManifest,
} from './index';

const item = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: { en: 'Desk', es: 'Escritorio' },
  category: 'desk',
  tags: ['desk'],
  size: { w: 1.4, h: 0.74, d: 0.7 },
  placement: { surfaces: ['floor'] },
  slots: [
    {
      id: 'top',
      label: { en: 'Desktop', es: 'Tablero' },
      default: { presetId: 'paint.satin', tint: '#c6a47d', roughness: 0.65 },
    },
  ],
  source: {
    kind: 'glb',
    file: `models/${id.replaceAll('.', '-')}.glb`,
    triangles: 3300,
    bytes: 98108,
  },
  license: {
    spdx: 'LicenseRef-RoomForge-Proprietary',
    author: 'RoomForge',
    origin: 'Original procedural geometry',
    attribution: 'RoomForge. All rights reserved.',
  },
  ...overrides,
});

type Source = { source: { file: string; triangles: number; bytes: number } };
const manifest = (...items: Source[]) => ({ version: 1, items });

/** Every file the manifest names exists with exactly the stats it declares. */
const filesOf =
  (input: { items: Source[] }) =>
  (file: string): CatalogFileStats | undefined => {
    const found = input.items.find((entry) => entry.source.file === file);
    return found && { triangles: found.source.triangles, bytes: found.source.bytes };
  };

const codes = (input: ReturnType<typeof manifest>, files = filesOf(input)) =>
  validateCatalogManifest(input, files).map((issue) => issue.code);

describe('CatalogManifestSchema', () => {
  it('accepts a complete item', () => {
    expect(CatalogManifestSchema.safeParse(manifest(item('desk.office.140'))).success).toBe(true);
  });

  it.each([
    ['an id with capitals', { id: 'Desk.office' }],
    ['an id without a family', { id: 'desk' }],
    ['a name missing a language', { name: { en: 'Desk' } }],
    ['an unknown category', { category: 'kitchen' }],
    ['a zero size', { size: { w: 0, h: 1, d: 1 } }],
    ['no surface', { placement: { surfaces: [] } }],
    [
      'a file outside models/',
      { source: { kind: 'glb', file: '../x.glb', triangles: 1, bytes: 1 } },
    ],
    [
      'a slot colour that is not hex',
      {
        slots: [
          {
            id: 'top',
            label: { en: 'a', es: 'b' },
            default: { presetId: 'paint.satin', tint: 'red' },
          },
        ],
      },
    ],
    ['a licence without author', { license: { spdx: 'CC0-1.0', origin: 'x', attribution: 'y' } }],
  ])('rejects %s', (_, overrides) => {
    expect(
      CatalogManifestSchema.safeParse(manifest(item('desk.office.140', overrides))).success,
    ).toBe(false);
  });
});

describe('validateCatalogManifest', () => {
  it('passes a valid manifest', () => {
    const input = manifest(item('desk.office.140'), item('chair.gaming.racing'));
    expect(validateCatalogManifest(input, filesOf(input))).toEqual([]);
  });

  it('reports schema problems with their path', () => {
    const [issue] = validateCatalogManifest(
      manifest(item('desk.office.140', { tags: 'x' })),
      () => undefined,
    );
    expect(issue).toMatchObject({ code: 'schema' });
    expect(issue?.message).toContain('items.0.tags');
  });

  it('fails on a duplicated id', () => {
    expect(codes(manifest(item('desk.office.140'), item('desk.office.140')))).toEqual([
      'duplicate-id',
    ]);
  });

  it('fails on duplicated slot ids inside an item', () => {
    const slot = item('x.y').slots[0];
    expect(codes(manifest(item('desk.office.140', { slots: [slot, slot] })))).toEqual([
      'duplicate-slot',
    ]);
  });

  it('fails when the file does not exist', () => {
    expect(codes(manifest(item('desk.office.140')), () => undefined)).toEqual(['missing-file']);
  });

  it('fails when the declared stats are not the file', () => {
    const input = manifest(item('desk.office.140'));
    expect(codes(input, () => ({ triangles: 3300, bytes: 1 }))).toEqual(['stats-mismatch']);
  });

  it('fails over the triangle or byte budget, per category when one is set', () => {
    const heavy = (id: string, triangles: number, bytes: number) =>
      item(id, { source: { kind: 'glb', file: `models/${id}.glb`, triangles, bytes } });
    expect(codes(manifest(heavy('desk.a', 20_001, 1)))).toEqual(['over-budget']);
    expect(codes(manifest(heavy('desk.b', 1, 300_001)))).toEqual(['over-budget']);
    expect(codes(manifest(heavy('desk.c', 20_000, 300_000)))).toEqual([]);
    const strict = {
      ...DEFAULT_CATALOG_POLICY,
      budgets: {
        ...DEFAULT_CATALOG_POLICY.budgets,
        byCategory: { desk: { triangles: 10, bytes: 10 } },
      },
    };
    const input = manifest(heavy('desk.d', 11, 1));
    expect(validateCatalogManifest(input, filesOf(input), strict).map((i) => i.code)).toEqual([
      'over-budget',
    ]);
  });

  it('fails on a licence outside the allow-list', () => {
    const license = { ...item('a.b').license, spdx: 'CC-BY-NC-4.0', sourceUrl: 'https://x.test' };
    expect(codes(manifest(item('desk.office.140', { license })))).toEqual(['license']);
  });

  it('asks third-party assets where they come from', () => {
    const license = { ...item('a.b').license, spdx: 'CC0-1.0' };
    expect(codes(manifest(item('desk.office.140', { license })))).toEqual(['license']);
    expect(
      codes(
        manifest(
          item('desk.office.140', { license: { ...license, sourceUrl: 'https://kenney.nl' } }),
        ),
      ),
    ).toEqual([]);
  });

  it('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(Array.isArray(validateCatalogManifest(input, () => undefined))).toBe(true);
      }),
    );
  });
});

describe('toCatalogItem', () => {
  it('keeps what core needs to check placements and materials', () => {
    const parsed = CatalogManifestSchema.parse(
      manifest(item('desk.office.140')),
    ) as CatalogManifest;
    const entry = parsed.items[0];
    if (!entry) throw new Error('no item');
    expect(toCatalogItem(entry)).toEqual({
      id: 'desk.office.140',
      size: { w: 1.4, h: 0.74, d: 0.7 },
      placement: { surfaces: ['floor'] },
      slots: [
        { id: 'top', default: { presetId: 'paint.satin', tint: '#c6a47d', roughness: 0.65 } },
      ],
    });
  });
});
