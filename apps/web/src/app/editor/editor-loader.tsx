'use client';

import dynamic from 'next/dynamic';
import { translate } from '@/ui';

// The editor is client-only (ADR-0002): it reads viewport size and storage, and will host WebGL.
export const EditorLoader = dynamic(() => import('@/ui').then((m) => m.EditorShell), {
  ssr: false,
  loading: () => (
    <p role="status" className="grid h-dvh place-items-center text-fg-muted">
      {translate('en', 'shell.loading')}
    </p>
  ),
});
