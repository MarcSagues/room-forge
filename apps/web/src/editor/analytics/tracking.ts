import type { SessionEvents } from '@roomforge/core';
import type { Analytics } from './analytics';

type Patch = SessionEvents['document:changed']['patches'][number];

/** The parts of the session and of autosave the tracking listens to. */
export interface TrackingSources {
  onDocumentChanged(listener: (change: SessionEvents['document:changed']) => void): () => void;
  /** Autosave's state, when this tab saves (absent in a read-only tab or the viewer). */
  onSaveStatus?(listener: (status: string) => void): () => void;
}

/** `objects/<id>` added: an object was placed (not loaded, not undone). */
const placesObject = (patch: Patch) =>
  patch.op === 'add' && patch.path.length === 2 && patch.path[0] === 'objects';

/** A luminaire's light (`objects/<id>/light…`) or the day/night mode (`lighting…`). */
const changesLight = (patch: Patch) =>
  (patch.path[0] === 'objects' && patch.path[2] === 'light') || patch.path[0] === 'lighting';

/**
 * Derives `first_object_placed`, `light_changed` and `project_saved` from what the editor already
 * emits, so no command or panel knows about analytics. Only edits count: loading a project, undo
 * and redo do not. Runs off the hot path: once per committed command, never per pointer move.
 */
export function installAnalyticsTracking(sources: TrackingSources, analytics: Analytics) {
  if (!analytics.enabled) return () => {};
  const offDocument = sources.onDocumentChanged(({ patches, source }) => {
    if (source !== 'command') return;
    if (patches.some(placesObject)) analytics.track('first_object_placed');
    if (patches.some(changesLight)) analytics.track('light_changed');
  });
  let previous: string | null = null;
  const offSave = sources.onSaveStatus?.((status) => {
    if (previous === 'saving' && status === 'saved') analytics.track('project_saved');
    previous = status;
  });
  return () => {
    offDocument();
    offSave?.();
  };
}
