'use client';

import dynamic from 'next/dynamic';
import { type ReactNode, useSyncExternalStore } from 'react';
import { subscribeToToasts, toastsWanted } from '@/ui/components/toast';
import { TooltipProvider } from '@/ui/components/tooltip';

const Toaster = dynamic(() => import('@/ui/components/sonner').then((module) => module.Toaster), {
  ssr: false,
});

/** The toaster mounts with the first toast (see `notify`), so no page loads sonner up front. */
function LazyToaster() {
  const wanted = useSyncExternalStore(subscribeToToasts, toastsWanted, () => false);
  return wanted ? <Toaster /> : null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <LazyToaster />
    </TooltipProvider>
  );
}
