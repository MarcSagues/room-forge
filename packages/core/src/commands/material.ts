import type { z } from 'zod/mini';
import {
  LIMITS,
  type MaterialRef,
  type ObjectId,
  type PlacedObject,
  PlacedObjectSchema,
} from '../domain';
import type { Command, CommandError } from '../session';

const invalid = (message: string): CommandError => ({ code: 'invalid', message });
const notFound = (id: string): CommandError => ({
  code: 'not-found',
  message: `No object "${id}"`,
});

function describeIssues(error: z.core.$ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    )
    .join('; ');
}

const mergeKey = (type: string, ids: readonly string[], slotId: string) =>
  `${type}:${[...ids].sort().join(',')}:${slotId}`;

/**
 * `object/setMaterial`: puts `material` in the slot `slotId` of every object. A known catalog item
 * only takes the slots it declares (an item with none takes no material at all); an item the
 * catalog does not know takes any slot, and a preset id this version does not know is kept as it
 * is (invariant I6): the document is never changed by being opened. A burst of edits to the same
 * slot (a colour picker) becomes one history entry.
 */
export function setObjectMaterial(
  ids: readonly ObjectId[],
  slotId: string,
  material: MaterialRef,
): Command {
  return {
    type: 'object/setMaterial',
    label: 'Change material',
    mergeKey: mergeKey('object/setMaterial', ids, slotId),
    apply(draft, ctx) {
      if (ids.length === 0) return invalid('No objects given');
      // Field rules (hex tint, 0..1 ranges, key lengths) live in the schema, once.
      const parsed = PlacedObjectSchema.shape.materials.safeParse({ [slotId]: material });
      if (!parsed.success) return invalid(describeIssues(parsed.error));
      const checked = parsed.data[slotId] as MaterialRef;

      const targets: PlacedObject[] = [];
      for (const id of ids) {
        const object = draft.objects[id] as PlacedObject | undefined;
        if (!object) return notFound(id);
        const item = ctx.catalog.getItem(object.catalogId);
        if (item && !item.slots?.some((slot) => slot.id === slotId)) {
          return invalid(
            item.slots?.length
              ? `"${object.catalogId}" has no material slot "${slotId}"`
              : `"${object.catalogId}" has no material slots`,
          );
        }
        if (
          !(slotId in object.materials) &&
          Object.keys(object.materials).length >= LIMITS.maxMaterialSlots
        ) {
          return {
            code: 'limit-reached',
            message: `An object can hold at most ${LIMITS.maxMaterialSlots} material slots`,
          };
        }
        targets.push(object);
      }
      for (const object of targets) object.materials[slotId] = { ...checked };
    },
  };
}

/**
 * `object/resetMaterial`: removes the override in a slot, so the object shows its catalog item's own
 * default there again. Fine when the slot had no override.
 */
export function resetObjectMaterial(ids: readonly ObjectId[], slotId: string): Command {
  return {
    type: 'object/resetMaterial',
    label: 'Reset material',
    mergeKey: mergeKey('object/resetMaterial', ids, slotId),
    apply(draft) {
      if (ids.length === 0) return invalid('No objects given');
      const targets: PlacedObject[] = [];
      for (const id of ids) {
        const object = draft.objects[id] as PlacedObject | undefined;
        if (!object) return notFound(id);
        targets.push(object);
      }
      for (const object of targets) delete object.materials[slotId];
    },
  };
}
