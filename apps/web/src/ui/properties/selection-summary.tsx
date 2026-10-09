'use client';

import type { CatalogProvider, EditorSession, ObjectId } from '@roomforge/core';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { translate } from '@/ui/i18n';
import { PanelHint } from '@/ui/shell/side-panel';
import { type LiveTransform, ObjectProperties } from './object-properties';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

/**
 * The Properties tab: the editable details of the selected object, a count for multi-selection,
 * or the hint when nothing is selected. Subscribes to primitives only, so it re-renders when the
 * selection changes, never on hover.
 */
export function SelectionSummary({
  session,
  catalog,
  live,
}: {
  session: EditorSession;
  /** Sizes of catalog items, for the read-only dimensions. */
  catalog?: CatalogProvider;
  /** The pose of an object being dragged in the scene, so the fields can follow it. */
  live?: LiveTransform;
}) {
  const selected = useStore(
    session.store,
    useShallow((state) => {
      const id = state.selection[0] as ObjectId | undefined;
      return {
        count: state.selection.length,
        id: id && state.document.objects[id] ? id : undefined,
      };
    }),
  );

  if (selected.count === 0 || !selected.id) {
    return <PanelHint>{t('shell.propertiesHint')}</PanelHint>;
  }
  if (selected.count > 1) {
    return <PanelHint>{t('properties.selectedCount', { count: selected.count })}</PanelHint>;
  }
  return <ObjectProperties session={session} id={selected.id} catalog={catalog} live={live} />;
}
