'use client';

import type { EditorSession, ObjectId } from '@roomforge/core';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { translate } from '@/ui/i18n';
import { PanelHint } from '@/ui/shell/side-panel';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

/**
 * What is selected, for the Properties tab: the object's name and catalog item, a count for
 * multi-selection, or the hint when nothing is selected. Subscribes to primitives only, so it
 * re-renders when the selection (or the selected object's name) changes, never on hover.
 */
export function SelectionSummary({ session }: { session: EditorSession }) {
  const selected = useStore(
    session.store,
    useShallow((state) => {
      const id = state.selection[0] as ObjectId | undefined;
      const object = id ? state.document.objects[id] : undefined;
      return {
        count: state.selection.length,
        id: object ? id : undefined,
        name: object?.name,
        catalogId: object?.catalogId,
      };
    }),
  );

  if (selected.count === 0 || !selected.id) {
    return <PanelHint>{t('shell.propertiesHint')}</PanelHint>;
  }
  if (selected.count > 1) {
    return <PanelHint>{t('properties.selectedCount', { count: selected.count })}</PanelHint>;
  }
  return (
    <section aria-labelledby="rf-selection-title" className="flex flex-col gap-3 p-4">
      <h2 id="rf-selection-title" className="truncate font-medium text-fg">
        {selected.name ?? t('properties.unnamed')}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-fg-muted">{t('properties.catalogItem')}</dt>
        <dd className="truncate font-mono text-xs leading-5">{selected.catalogId}</dd>
      </dl>
    </section>
  );
}
