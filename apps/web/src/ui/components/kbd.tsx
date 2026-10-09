import type * as React from 'react';
import { cn } from '@/ui/lib/utils';

/** A key cap: one key of a shortcut, as in `Ctrl` `Z`. */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-sm border border-control bg-elevated px-1.5 py-0.5 font-mono text-fg text-xs leading-none',
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
