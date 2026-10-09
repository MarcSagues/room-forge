import type { z } from 'zod';
import {
  LightingSchema,
  type LightState,
  LightStateSchema,
  type ObjectId,
  type PlacedObject,
} from '../domain';
import type { AmbiencePreset } from '../lighting';
import type { CatalogItem } from '../ports';
import type { Command, CommandError } from '../session';

const invalid = (message: string): CommandError => ({ code: 'invalid', message });
const notFound = (id: string): CommandError => ({
  code: 'not-found',
  message: `No object "${id}"`,
});

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    )
    .join('; ');
}

const PatchSchema = LightStateSchema.partial();

/** What a light that was never configured looks like: on, steady, at the item's own colour. */
function defaultLight(item: CatalogItem | undefined): LightState {
  return {
    on: true,
    color: item?.light?.defaultColor ?? '#ffffff',
    intensity: 1,
    effect: { kind: 'static' },
  };
}

/** A copy that shares nothing with `state` (core has no structuredClone). */
const cloneLight = (state: LightState): LightState => JSON.parse(JSON.stringify(state));

/**
 * `light/set`: changes the given fields of the light of every object: `on`, `color`, `intensity`
 * or the `effect` (replaced as a whole). Only items with a light capability take one: a known item
 * without it makes the whole command fail; an item the catalog does not know is accepted (I6). A
 * light that was never set starts from the item's defaults. A burst of edits (a colour picker)
 * becomes one history entry.
 */
export function setLight(ids: readonly ObjectId[], patch: Partial<LightState>): Command {
  return {
    type: 'light/set',
    label: 'Change light',
    mergeKey: `light/set:${[...ids].sort().join(',')}:${Object.keys(patch).sort().join(',')}`,
    apply(draft, ctx) {
      if (ids.length === 0) return invalid('No objects given');
      const parsed = PatchSchema.safeParse(patch);
      if (!parsed.success) return invalid(describeIssues(parsed.error));
      if (Object.keys(parsed.data).length === 0) return invalid('Nothing to change');

      const targets: { object: PlacedObject; item: CatalogItem | undefined }[] = [];
      for (const id of ids) {
        const object = draft.objects[id] as PlacedObject | undefined;
        if (!object) return notFound(id);
        const item = ctx.catalog.getItem(object.catalogId);
        if (item && !item.light) return invalid(`"${object.catalogId}" cannot give light`);
        targets.push({ object, item });
      }
      const { on, color, intensity, effect } = parsed.data;
      for (const { object, item } of targets) {
        const next: LightState = { ...(object.light ?? defaultLight(item)) };
        if (on !== undefined) next.on = on;
        if (color !== undefined) next.color = color;
        if (intensity !== undefined) next.intensity = intensity;
        if (effect !== undefined) next.effect = effect;
        object.light = next;
      }
    },
  };
}

/** Switch every light on or off, or give them all the mood of an ambience preset. */
export type LightsChange = { on: boolean } | { preset: AmbiencePreset };

/**
 * `light/setAll`: one gesture, one history entry, for every light of the scene (an item with a light
 * capability, or an unknown item that already has a light state): turn them all on or off, or deal
 * an ambience preset's states out to them in order, wrapping around. Fails when there is no light.
 */
export function setAllLights(change: LightsChange): Command {
  return {
    type: 'light/setAll',
    label: 'Change all lights',
    apply(draft, ctx) {
      const lights: { object: PlacedObject; item: CatalogItem | undefined }[] = [];
      for (const id of draft.objectOrder) {
        const object = draft.objects[id] as PlacedObject | undefined;
        if (!object) continue;
        const item = ctx.catalog.getItem(object.catalogId);
        if (item ? item.light : object.light) lights.push({ object, item });
      }
      if (lights.length === 0) return invalid('There are no lights in the scene');

      if ('on' in change) {
        if (typeof change.on !== 'boolean') return invalid('"on" must be true or false');
        for (const { object, item } of lights) {
          object.light = { ...(object.light ?? defaultLight(item)), on: change.on };
        }
        return;
      }
      const states = change.preset.states.map((candidate) => LightStateSchema.safeParse(candidate));
      for (const result of states) {
        if (!result.success) return invalid(describeIssues(result.error));
      }
      lights.forEach(({ object }, index) => {
        const chosen = states[index % states.length];
        if (chosen?.success) object.light = cloneLight(chosen.data);
      });
    },
  };
}

/** `scene/setLightingMode`: day or night (the sun, the ambient level and the sky follow it). */
export function setLightingMode(mode: 'day' | 'night'): Command {
  return {
    type: 'scene/setLightingMode',
    label: 'Change lighting mode',
    apply(draft) {
      const parsed = LightingSchema.shape.mode.safeParse(mode);
      if (!parsed.success) return invalid(describeIssues(parsed.error));
      draft.lighting.mode = parsed.data;
    },
  };
}
