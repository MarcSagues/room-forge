import { describe, expect, it } from 'vitest';
import { FALLBACK_COLOR, placeholderColor } from './placeholder-colors';

describe('placeholderColor', () => {
  it('maps known presets to distinct colours', () => {
    expect(placeholderColor({ presetId: 'floor.oak' })).not.toBe(
      placeholderColor({ presetId: 'paint.matte' }),
    );
  });

  it('lets a valid tint override the preset', () => {
    expect(placeholderColor({ presetId: 'paint.matte', tint: '#ff7a45' })).toBe('#ff7a45');
  });

  it('ignores a malformed tint', () => {
    expect(placeholderColor({ presetId: 'floor.oak', tint: 'red' as never })).toBe(
      placeholderColor({ presetId: 'floor.oak' }),
    );
  });

  it('falls back to neutral grey for unknown presets (they are kept in the document, I6)', () => {
    expect(placeholderColor({ presetId: 'wood.walnut.unknown' })).toBe(FALLBACK_COLOR);
  });
});
