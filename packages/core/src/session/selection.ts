import type { DeepReadonly, ObjectId, OpeningId, RoomId, SceneDocument } from '../domain';

/** Anything the user can pick in the scene. */
export type EntityId = ObjectId | OpeningId | RoomId;

/** Editor tools (bottom bar). Not part of the document or the history. */
export type ToolId = 'select' | 'place' | 'opening';

/**
 * `replace` selects exactly `ids`; `add` extends the selection; `toggle` flips each id
 * (shift/ctrl-click). The MVP selects one entity at a time, but the API takes lists.
 */
export type SelectionMode = 'replace' | 'add' | 'toggle';

export function entityExists(doc: DeepReadonly<SceneDocument>, id: string): boolean {
  return (
    Object.hasOwn(doc.objects, id) ||
    Object.hasOwn(doc.openings, id) ||
    Object.hasOwn(doc.rooms, id)
  );
}

/** Next selection, keeping order and dropping ids that do not exist in `doc`. */
export function nextSelection(
  doc: DeepReadonly<SceneDocument>,
  current: readonly EntityId[],
  ids: readonly EntityId[],
  mode: SelectionMode,
): EntityId[] {
  const wanted = ids.filter((id) => entityExists(doc, id));
  if (mode === 'replace') return [...new Set(wanted)];
  if (mode === 'add') return [...new Set([...current, ...wanted])];
  const result = [...current];
  for (const id of new Set(wanted)) {
    const index = result.indexOf(id);
    if (index === -1) result.push(id);
    else result.splice(index, 1);
  }
  return result;
}

/** Drops ids that no longer exist (after a command or undo removed them). */
export function reconcileSelection(
  doc: DeepReadonly<SceneDocument>,
  selection: readonly EntityId[],
): readonly EntityId[] {
  const kept = selection.filter((id) => entityExists(doc, id));
  return kept.length === selection.length ? selection : kept;
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
