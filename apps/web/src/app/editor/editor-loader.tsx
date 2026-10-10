'use client';

import dynamic from 'next/dynamic';
import { translate } from '@/ui';

// The editor is client-only (ADR-0002): it reads viewport size and storage and hosts WebGL.
// Loading it lazily also keeps three.js out of every other route (the landing stays light).
export const EditorLoader = dynamic(() => import('./editor-app'), {
  ssr: false,
  loading: () => (
    <p role="status" className="grid h-dvh place-items-center text-fg-muted">
      {translate('en', 'shell.loading')}
    </p>
  ),
});

// The viewer of shared links (P6-08) is its own chunk: the editor route never loads its code.
export const ViewerLoader = dynamic(() => import('./viewer-app'), {
  ssr: false,
  loading: () => (
    <p role="status" className="grid h-dvh place-items-center text-fg-muted">
      {translate('en', 'viewer.opening')}
    </p>
  ),
});
