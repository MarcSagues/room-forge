import { DEFAULT_MATERIAL_PRESET_ID, type MaterialRef, resolveMaterial } from '@roomforge/core';
import { describe, expect, it } from 'vitest';
import { materialKey } from './material-key';

const key = (ref: MaterialRef, transparent = false) =>
  materialKey(resolveMaterial(ref), transparent);

describe('materialKey', () => {
  it('is the same for the same preset and overrides, and different otherwise', () => {
    expect(key({ presetId: 'wood.oak' })).toBe(key({ presetId: 'wood.oak' }));
    expect(key({ presetId: 'wood.oak' })).not.toBe(key({ presetId: 'wood.walnut' }));
    expect(key({ presetId: 'wood.oak' })).not.toBe(key({ presetId: 'wood.oak', tint: '#ff0000' }));
    expect(key({ presetId: 'wood.oak' })).not.toBe(key({ presetId: 'wood.oak', roughness: 0.1 }));
    expect(key({ presetId: 'metal.steel' })).not.toBe(
      key({ presetId: 'metal.steel', metalness: 0.5 }),
    );
  });

  it('does not tell apart an override that says what the preset already says', () => {
    expect(key({ presetId: 'wood.oak', roughness: 0.65 })).toBe(key({ presetId: 'wood.oak' }));
    expect(key({ presetId: 'wood.oak', metalness: 0 })).toBe(key({ presetId: 'wood.oak' }));
  });

  it('ignores float noise below a thousandth, and the case of a hex colour', () => {
    expect(key({ presetId: 'paint.matte', roughness: 0.5 })).toBe(
      key({ presetId: 'paint.matte', roughness: 0.5 + 1e-9 }),
    );
    expect(key({ presetId: 'paint.matte', tint: '#AABBCC' })).toBe(
      key({ presetId: 'paint.matte', tint: '#aabbcc' }),
    );
  });

  it('shares one material among all the presets this version does not know (they draw the default)', () => {
    expect(key({ presetId: 'from.the.future' })).toBe(key({ presetId: 'also.unknown' }));
    expect(key({ presetId: 'from.the.future' })).toBe(
      key({ presetId: DEFAULT_MATERIAL_PRESET_ID }),
    );
  });

  it('tells a see-through material from an opaque one: they are different shaders', () => {
    expect(key({ presetId: 'paint.matte' }, true)).not.toBe(
      key({ presetId: 'paint.matte' }, false),
    );
  });

  it('never lets two different looks collide', () => {
    const refs: MaterialRef[] = [
      { presetId: 'wood.oak' },
      { presetId: 'wood.oak', tint: '#112233' },
      { presetId: 'wood.oak', tint: '#112234' },
      { presetId: 'wood.oak', roughness: 0.2 },
      { presetId: 'wood.oak', roughness: 0.201 },
      { presetId: 'wood.oak', metalness: 1 },
    ];
    expect(new Set(refs.map((ref) => key(ref))).size).toBe(refs.length);
  });
});
