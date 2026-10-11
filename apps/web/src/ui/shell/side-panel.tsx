import type { ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';

interface SidePanelProps {
  id: string;
  label: string;
  /** Collapsed or closed panels are `inert`: not focusable and hidden from assistive technology. */
  hidden: boolean;
  className?: string | undefined;
  /** What the first-run tour calls this panel (`data-tour`). */
  tour?: string;
  children: ReactNode;
}

/** Landmark container for a side panel (catalog, properties). */
export function SidePanel({ id, label, hidden, className, tour, children }: SidePanelProps) {
  return (
    <aside
      id={id}
      aria-label={label}
      data-tour={tour}
      inert={hidden}
      className={cn('flex h-full min-h-0 min-w-60 flex-col overflow-hidden bg-card', className)}
    >
      {children}
    </aside>
  );
}

export function PanelHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center border-b px-3 font-medium text-fg-muted text-xs uppercase tracking-wide">
      {children}
    </div>
  );
}

export function PanelHint({ children }: { children: ReactNode }) {
  return <p className="p-4 text-fg-subtle">{children}</p>;
}
