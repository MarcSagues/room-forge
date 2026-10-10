'use client';

import { ChevronDownIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu';
import { translate } from '@/ui/i18n';
import { useProjectStatus } from './project-status';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

/** The image export dialog, fetched the first time it is opened (the `/editor/` bundle budget). */
const LazyImageExportDialog = dynamic(
  () => import('./image-export-dialog').then((module) => module.ImageExportDialog),
  { ssr: false },
);

// The dialog is loaded on demand; the toast is shown from here so its chunk does not need sonner.
const showSaved = (message: string) => toast.success(message, { id: 'image-export' });

/**
 * The Export button of the top bar: a menu of what the open project can be turned into, its
 * project file (P6-05) and, when the app wires the scene in, a PNG of the view (P6-06). Without a
 * project to export it is the placeholder it has always been.
 */
export function ExportMenu() {
  const { onExport, imageExport } = useProjectStatus();
  const [imageOpen, setImageOpen] = useState(false);
  // Mounted from the first opening on, so the dialog keeps the choices made in it.
  const [imageRequested, setImageRequested] = useState(false);
  if (!onExport) {
    return (
      <Button variant="outline" size="sm" disabled title={t('shell.soon')}>
        {t('shell.export')}
      </Button>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            {t('shell.export')}
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onExport()}>
            {t('shell.exportProject')}
          </DropdownMenuItem>
          {imageExport ? (
            <DropdownMenuItem
              onSelect={() => {
                setImageRequested(true);
                setImageOpen(true);
              }}
            >
              {t('shell.exportImage')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {imageExport && imageRequested ? (
        <LazyImageExportDialog
          open={imageOpen}
          onOpenChange={setImageOpen}
          load={imageExport}
          onSaved={showSaved}
        />
      ) : null}
    </>
  );
}
