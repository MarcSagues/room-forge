import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_MATERIALS } from '../commands';
import { LIMITS, MaterialRefSchema } from '../domain';
import {
  DEFAULT_MATERIAL_PRESET_ID,
  getMaterialPreset,
  MATERIAL_CATEGORIES,
  MATERIAL_PRESETS,
  resolveMaterial,
} from './index';

describe('the preset library', () => {
  it('has at least twenty presets, each with a unique id', () => {
    expect(MATERIAL_PRESETS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(MATERIAL_PRESETS.map((preset) => preset.id)).size).toBe(MATERIAL_PRESETS.length);
  });

  it('names every preset in English and Spanish', () => {
    for (const preset of MATERIAL_PRESETS) {
      expect(preset.name.en.length, preset.id).toBeGreaterThan(2);
      expect(preset.name.es.length, preset.id).toBeGreaterThan(2);
    }
  });

  it('has valid ids, colours and PBR values', () => {
    for (const preset of MATERIAL_PRESETS) {
      expect(preset.id, preset.id).toMatch(/^[a-z][a-z0-9.]*$/);
      expect(preset.id.length).toBeLessThanOrEqual(LIMITS.maxKeyLength);
      expect(preset.color, preset.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(preset.roughness).toBeGreaterThanOrEqual(0);
      expect(preset.roughness).toBeLessThanOrEqual(1);
      expect(preset.metalness).toBeGreaterThanOrEqual(0);
      expect(preset.metalness).toBeLessThanOrEqual(1);
      // Every preset is usable as a MaterialRef of the document.
      expect(MaterialRefSchema.safeParse({ presetId: preset.id }).success, preset.id).toBe(true);
    }
  });

  it('covers every category, and the ids follow their category', () => {
    for (const category of MATERIAL_CATEGORIES) {
      expect(
        MATERIAL_PRESETS.some((preset) => preset.category === category),
        category,
      ).toBe(true);
    }
    for (const preset of MATERIAL_PRESETS) {
      expect(preset.id.startsWith(`${preset.category}.`), preset.id).toBe(true);
    }
  });

  it('includes what new rooms use by default', () => {
    for (const { presetId } of Object.values(DEFAULT_ROOM_MATERIALS)) {
      expect(getMaterialPreset(presetId), presetId).toBeDefined();
    }
    expect(getMaterialPreset(DEFAULT_MATERIAL_PRESET_ID)).toBeDefined();
  });

  it('keeps patterns procedural: no image files, nothing heavy to download', () => {
    for (const preset of MATERIAL_PRESETS) {
      if (preset.pattern !== undefined) {
        expect(['wood-grain', 'planks', 'concrete', 'slats', 'weave', 'tiles']).toContain(
          preset.pattern,
        );
      }
    }
  });
});

describe('getMaterialPreset', () => {
  it('finds a preset by id, and nothing for an unknown one', () => {
    expect(getMaterialPreset('wood.oak')?.category).toBe('wood');
    expect(getMaterialPreset('no.such.preset')).toBeUndefined();
    expect(getMaterialPreset('__proto__')).toBeUndefined();
    expect(getMaterialPreset('constructor')).toBeUndefined();
  });
});

describe('resolveMaterial', () => {
  it('gives the preset as it is when there are no overrides', () => {
    const oak = getMaterialPreset('wood.oak');
    expect(resolveMaterial({ presetId: 'wood.oak' })).toEqual({
      presetId: 'wood.oak',
      known: true,
      color: oak?.color,
      tint: null,
      roughness: oak?.roughness,
      metalness: oak?.metalness,
      pattern: oak?.pattern ?? null,
    });
  });

  it('applies the tint, roughness and metalness of the reference over the preset', () => {
    const resolved = resolveMaterial({
      presetId: 'paint.matte',
      tint: '#336699',
      roughness: 0.2,
      metalness: 1,
    });
    expect(resolved).toMatchObject({ tint: '#336699', roughness: 0.2, metalness: 1 });
    // The preset's own colour stays: the renderer multiplies the tint with it.
    expect(resolved.color).toBe(getMaterialPreset('paint.matte')?.color);
  });

  it('keeps an unknown preset id and draws it with the default material (invariant I6)', () => {
    const resolved = resolveMaterial({ presetId: 'wood.from.the.future', tint: '#ff0000' });
    const fallback = getMaterialPreset(DEFAULT_MATERIAL_PRESET_ID);
    expect(resolved).toMatchObject({
      presetId: 'wood.from.the.future',
      known: false,
      color: fallback?.color,
      roughness: fallback?.roughness,
      tint: '#ff0000',
    });
  });

  it('treats an override of 0 as an override, not as missing', () => {
    expect(resolveMaterial({ presetId: 'metal.steel', roughness: 0, metalness: 0 })).toMatchObject({
      roughness: 0,
      metalness: 0,
    });
  });
});
