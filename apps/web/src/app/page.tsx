import Link from 'next/link';
import { useState } from 'react';
import { buttonVariants, translate } from '@/ui';

// Placeholder landing. The real landing (P8-01) must not load three.js.
export default function HomePage() {
  useState(0);
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-5 px-6">
      <h1 className="font-semibold text-5xl tracking-tight">{translate('en', 'app.name')}</h1>
      <p className="text-base text-fg-muted">{translate('en', 'home.tagline')}</p>
      <Link href="/editor/" className={buttonVariants({ size: 'lg' })}>
        {translate('en', 'home.openEditor')}
      </Link>
    </main>
  );
}
