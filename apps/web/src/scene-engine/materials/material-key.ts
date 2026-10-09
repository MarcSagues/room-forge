import { DEFAULT_MATERIAL_PRESET_ID, type ResolvedMaterial } from '@roomforge/core';

const thousandths = (value: number) => Math.round(value * 1000) / 1000;

/**
 * What two materials must have in common to be the same one: the preset that is really drawn (an
 * unknown preset draws the default, so all of them share it), the tint, the surface values and
 * whether it is see-through. Everything else about a material follows from these.
 */
export function materialKey(material: ResolvedMaterial, transparent: boolean): string {
  const preset = material.known ? material.presetId : DEFAULT_MATERIAL_PRESET_ID;
  const tint = material.tint ? material.tint.toLowerCase() : '-';
  const kind = transparent ? 'transparent' : 'opaque';
  return [
    preset,
    tint,
    thousandths(material.roughness),
    thousandths(material.metalness),
    kind,
  ].join('|');
}
