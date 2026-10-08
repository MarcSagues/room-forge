import { CORE_PACKAGE_NAME } from '@roomforge/core';
import { translate } from '@/ui';

// Placeholder editor route. The shell arrives with P1-06 and the 3D canvas with P2-06.
// The core import only proves the workspace wiring (web → core, transpiled by Next).
export default function EditorPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-2 px-6">
      <h1 className="font-semibold text-3xl tracking-tight">{translate('en', 'editor.title')}</h1>
      <p className="text-fg-muted">
        {translate('en', 'editor.comingSoon')}{' '}
        {translate('en', 'editor.corePackage', { name: CORE_PACKAGE_NAME })}
      </p>
    </main>
  );
}
