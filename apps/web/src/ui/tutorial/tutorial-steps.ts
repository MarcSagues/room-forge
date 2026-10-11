import type { MessageKey } from '@/ui/i18n';
import { safeLayoutStorage } from '@/ui/shell/layout-storage';

/** Where the tour points: an element of the shell marked `data-tour="<target>"`. */
export type TutorialTarget = 'catalog' | 'viewport' | 'bottom-bar' | 'properties' | 'export';

export interface TutorialStep {
  readonly id: string;
  readonly target: TutorialTarget;
  readonly title: MessageKey;
  readonly body: MessageKey;
}

/** The first-run tour (P8-02): place, move and turn, view and snap, colour, light, keep. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'place', target: 'catalog', title: 'tutorial.place.title', body: 'tutorial.place.body' },
  { id: 'move', target: 'viewport', title: 'tutorial.move.title', body: 'tutorial.move.body' },
  { id: 'view', target: 'bottom-bar', title: 'tutorial.view.title', body: 'tutorial.view.body' },
  {
    id: 'colour',
    target: 'properties',
    title: 'tutorial.colour.title',
    body: 'tutorial.colour.body',
  },
  { id: 'light', target: 'catalog', title: 'tutorial.light.title', body: 'tutorial.light.body' },
  { id: 'keep', target: 'export', title: 'tutorial.keep.title', body: 'tutorial.keep.body' },
];

/** Set once the tour was finished or skipped, so it opens by itself only on the first visit. */
export const TUTORIAL_SEEN_KEY = 'roomforge.tutorialSeen';

/** Blocked storage (private mode, no site data) counts as seen: a tour on every visit is worse. */
export function tutorialSeen(): boolean {
  try {
    return (
      globalThis.localStorage === undefined || localStorage.getItem(TUTORIAL_SEEN_KEY) !== null
    );
  } catch {
    return true;
  }
}

export function markTutorialSeen(): void {
  safeLayoutStorage.setItem(TUTORIAL_SEEN_KEY, '1');
}
