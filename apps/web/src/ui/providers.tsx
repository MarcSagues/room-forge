'use client';

import type { ReactNode } from 'react';
import { Toaster } from '@/ui/components/sonner';
import { TooltipProvider } from '@/ui/components/tooltip';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
