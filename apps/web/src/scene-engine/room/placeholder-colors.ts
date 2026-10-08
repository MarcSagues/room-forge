import type { MaterialRef } from '@roomforge/core';

/**
 * Stand-in colours per material preset until the real material system (P5-01/P5-02). Unknown
 * presets are fine (invariant I6): they fall back to a neutral grey.
 */
const PRESET_COLORS: Readonly<Record<string, string>> = {
  'paint.matte': '#d6dae1',
  'paint.satin': '#d6dae1',
  'floor.oak': '#b58b62',
  'floor.grey': '#8d939c',
  'floor.concrete': '#9a9da3',
};

export const FALLBACK_COLOR = '#c4c9d1';

const HEX = /^#[0-9a-fA-F]{6}$/;

export function placeholderColor(material: Pick<MaterialRef, 'presetId' | 'tint'>): string {
  if (material.tint && HEX.test(material.tint)) return material.tint;
  return PRESET_COLORS[material.presetId] ?? FALLBACK_COLOR;
}
