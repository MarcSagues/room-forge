'use client';

import { type MessageKey, translate } from '@/ui/i18n';

const t = (key: MessageKey) => translate('en', key);

/** Where the WebGL context is: working, lost (the browser may give it back), or just restored. */
export type ContextState = 'ok' | 'lost' | 'restored';

/**
 * A notice over the viewport while the graphics context is lost and, briefly, once it is back. The
 * document and the selection live outside the canvas, so nothing is lost: the scene is redrawn
 * from them when the context returns.
 */
export function ContextNotice({ state }: { state: ContextState }) {
  if (state === 'ok') return null;
  const lost = state === 'lost';
  const className =
    'pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md border bg-card px-3 py-2 text-sm shadow-md';
  return lost ? (
    <div role="alert" className={className}>
      {t('error.contextLost')}
    </div>
  ) : (
    <output className={className}>{t('error.contextRestored')}</output>
  );
}
