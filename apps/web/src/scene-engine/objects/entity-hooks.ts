'use client';

import type { DeepReadonly, ObjectId, PlacedObject, SceneDocument } from '@roomforge/core';
import { useShallow } from 'zustand/react/shallow';
import { useSessionState } from '../canvas/use-session-state';

const NO_IDS: readonly ObjectId[] = [];
const ROOT = '';

/**
 * Objects grouped by parent (`''` for objects standing on a room), in outliner order. Built once
 * per document version: with one view per object, filtering `objectOrder` in every selector would
 * cost O(n²) per change.
 */
const childrenByDocument = new WeakMap<object, Map<string, ObjectId[]>>();

function childrenIndex(doc: DeepReadonly<SceneDocument>): Map<string, ObjectId[]> {
  let index = childrenByDocument.get(doc);
  if (!index) {
    index = new Map();
    for (const id of doc.objectOrder) {
      const object = doc.objects[id];
      if (!object) continue;
      const key = object.parentId ?? ROOT;
      const list = index.get(key);
      if (list) list.push(id);
      else index.set(key, [id]);
    }
    childrenByDocument.set(doc, index);
  }
  return index;
}

/**
 * Ids of the objects standing on a room (no parent), in outliner order. Shallow-compared: the
 * list re-renders only when an object is added, removed, re-parented or reordered, never when
 * one moves.
 */
export function useEntityIds(): readonly ObjectId[] {
  return useSessionState(useShallow((state) => childrenIndex(state.document).get(ROOT) ?? NO_IDS));
}

/** Ids of the objects standing on `parentId`, in outliner order. */
export function useChildIds(parentId: ObjectId): readonly ObjectId[] {
  return useSessionState(
    useShallow((state) => childrenIndex(state.document).get(parentId) ?? NO_IDS),
  );
}

/**
 * A slice of one object. Immer keeps untouched objects by reference, so selecting the object (or
 * one of its fields) re-renders only when that object changes. `undefined` once it is removed.
 */
export function useEntity<T>(
  id: ObjectId,
  selector: (object: DeepReadonly<PlacedObject>) => T,
): T | undefined {
  return useSessionState((state) => {
    const object = state.document.objects[id];
    return object ? selector(object) : undefined;
  });
}
