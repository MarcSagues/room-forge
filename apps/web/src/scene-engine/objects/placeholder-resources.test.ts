import { describe, expect, it } from 'vitest';
import { placeholderMaterial, placeholderResources } from './placeholder-resources';

describe('placeholder resources', () => {
  it('share one geometry between every object', () => {
    expect(placeholderResources().geometry).toBe(placeholderResources().geometry);
  });

  it('use the default material when the catalog gives no colour', () => {
    expect(placeholderMaterial(undefined)).toBe(placeholderResources().material);
  });

  it('share one material per colour, whatever its case', () => {
    const wood = placeholderMaterial('#8B6F9E');
    expect(placeholderMaterial('#8b6f9e')).toBe(wood);
    expect(placeholderMaterial('#4a5568')).not.toBe(wood);
    expect(wood).not.toBe(placeholderResources().material);
    expect(`#${wood.color.getHexString()}`).toBe('#8b6f9e');
  });
});
