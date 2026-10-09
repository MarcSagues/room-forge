import type { HexColor, LightState } from '../domain';

/**
 * A mood for every light of the scene: a few light states dealt out in order to the lights, and
 * wrapping around, so a preset looks different on one lamp and on a dozen. App data like the
 * material presets, not part of the document; applying one writes ordinary `LightState`s.
 */
export interface AmbiencePreset {
  readonly id: string;
  readonly name: { readonly en: string; readonly es: string };
  readonly states: readonly [LightState, ...LightState[]];
}

const state = (
  color: HexColor,
  intensity: number,
  effect: LightState['effect'] = { kind: 'static' },
): LightState => ({ on: true, color, intensity, effect });

export const AMBIENCE_PRESETS: readonly AmbiencePreset[] = [
  {
    id: 'cyberpunk',
    name: { en: 'Cyberpunk', es: 'Cyberpunk' },
    states: [
      state('#ff2bd6', 1),
      state('#19e6ff', 0.9, { kind: 'breathing', speed: 0.6 }),
      state('#8a2be2', 0.8, {
        kind: 'cycle',
        speed: 0.5,
        palette: ['#ff2bd6', '#19e6ff', '#8a2be2'],
      }),
    ],
  },
  {
    id: 'sunset',
    name: { en: 'Sunset', es: 'Atardecer' },
    states: [
      state('#ff7a3d', 0.8),
      state('#ffb36b', 0.6, { kind: 'breathing', speed: 0.3 }),
      state('#ff5e62', 0.7),
    ],
  },
  {
    id: 'warm',
    name: { en: 'Warm', es: 'Cálido' },
    states: [state('#ffb870', 0.7), state('#ffd29e', 0.55)],
  },
  {
    id: 'cool',
    name: { en: 'Cool', es: 'Frío' },
    states: [state('#9fd0ff', 0.7), state('#c9e4ff', 0.55), state('#7aa8ff', 0.6)],
  },
];

const BY_ID = new Map(AMBIENCE_PRESETS.map((preset) => [preset.id, preset]));

export function getAmbiencePreset(id: string): AmbiencePreset | undefined {
  return BY_ID.get(id);
}
