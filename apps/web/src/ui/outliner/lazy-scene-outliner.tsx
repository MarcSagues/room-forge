'use client';

import dynamic from 'next/dynamic';
import { translate } from '@/ui/i18n';

/**
 * The outliner, loaded the first time the Scene tab is shown. The tab is not the one that opens,
 * and its content is only mounted while it is active, so the editor starts without this code
 * (the `/editor/` bundle budget, P7-04).
 */
export const LazySceneOutliner = dynamic(
  () => import('./scene-outliner').then((module) => module.SceneOutliner),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="p-4 text-fg-muted text-sm">
        {translate('en', 'shell.panelLoading')}
      </p>
    ),
  },
);
