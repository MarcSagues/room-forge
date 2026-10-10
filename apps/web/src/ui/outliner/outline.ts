import type { DeepReadonly, EntityId, ObjectId, SceneDocument } from '@roomforge/core';

export type OutlineKind = 'room' | 'door' | 'window' | 'object';

/** One row of the scene outline, in display order. */
export interface OutlineRow {
  readonly id: EntityId;
  readonly kind: OutlineKind;
  /** 1 for rooms; children are one deeper than their parent. */
  readonly level: number;
  /** The row this one hangs from, or `null` for rooms. */
  readonly parent: EntityId | null;
  /** Position among its siblings (1-based) and how many siblings there are, for assistive tech. */
  readonly position: number;
  readonly siblings: number;
  readonly hasChildren: boolean;
  /** The custom name of a room or object; `undefined` when the label must be made up. */
  readonly name: string | undefined;
  /** Catalog id of an object, wall of an opening; used to make up a label. */
  readonly detail: string;
  readonly hidden: boolean;
  readonly locked: boolean;
}

type Doc = DeepReadonly<SceneDocument>;
type Draft = Omit<OutlineRow, 'position' | 'siblings' | 'hasChildren'>;

/**
 * The document as a tree: each room, then its openings, then its objects in `objectOrder` with
 * the objects standing on them nested below. Flat, depth-first, so the tree can render it as one
 * list with `aria-level`.
 */
export function buildOutline(doc: Doc): OutlineRow[] {
  const children = new Map<EntityId | null, Draft[]>();
  const add = (row: Draft) => {
    const list = children.get(row.parent);
    if (list) list.push(row);
    else children.set(row.parent, [row]);
  };

  for (const id of doc.roomOrder) {
    const room = doc.rooms[id];
    if (!room) continue;
    add({ ...base(id, 'room', null), name: room.name });
  }
  for (const opening of Object.values(doc.openings)) {
    add({ ...base(opening.id, opening.kind, opening.roomId), detail: opening.wall });
  }
  for (const id of doc.objectOrder) {
    const object = doc.objects[id];
    if (!object) continue;
    add({
      ...base(id, 'object', object.parentId ?? object.roomId),
      name: object.name,
      detail: object.catalogId,
      hidden: object.hidden,
      locked: object.locked,
    });
  }

  const rows: OutlineRow[] = [];
  const walk = (parent: EntityId | null, level: number) => {
    const list = children.get(parent) ?? [];
    list.forEach((row, index) => {
      rows.push({
        ...row,
        level,
        position: index + 1,
        siblings: list.length,
        hasChildren: children.has(row.id),
      });
      walk(row.id, level + 1);
    });
  };
  walk(null, 1);
  return rows;
}

function base(id: EntityId, kind: OutlineKind, parent: EntityId | null): Draft {
  return { id, kind, level: 0, parent, name: undefined, detail: '', hidden: false, locked: false };
}

/** Rows not inside a collapsed row. */
export function visibleRows(rows: readonly OutlineRow[], collapsed: ReadonlySet<string>) {
  const shown: OutlineRow[] = [];
  const hiddenUnder = new Set<string>();
  for (const row of rows) {
    if (row.parent !== null && (collapsed.has(row.parent) || hiddenUnder.has(row.parent))) {
      hiddenUnder.add(row.id);
      continue;
    }
    shown.push(row);
  }
  return shown;
}

/**
 * Where `object/reorder` must put `id` to swap it with its previous (`-1`) or next (`+1`)
 * sibling in the outline, or `null` at the end of its siblings.
 */
export function reorderTarget(doc: Doc, id: ObjectId, step: -1 | 1): number | null {
  const object = doc.objects[id];
  if (!object) return null;
  const siblings = doc.objectOrder.filter((other) => {
    const candidate = doc.objects[other];
    return candidate?.parentId === object.parentId && candidate.roomId === object.roomId;
  });
  const neighbour = siblings[siblings.indexOf(id) + step];
  // Before the previous sibling, or right after the next one: either way, its current index.
  return neighbour === undefined ? null : doc.objectOrder.indexOf(neighbour);
}
