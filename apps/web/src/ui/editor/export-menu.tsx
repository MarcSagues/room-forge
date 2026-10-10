'use client';

import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/ui/components/button';
import { DeferredDropdownMenu } from '@/ui/components/deferred-dropdown-menu';
import { translate } from '@/ui/i18n';
import { useProjectStatus } from './project-status';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

/**
 * The Export button of the top bar: a menu of what the open project can be turned into. Today that
 * is its project file (P6-05); the PNG arrives with P6-06 as one more entry. Without a project to
 * export it is the placeholder it has always been.
 */
export function ExportMenu() {
  const { onExport } = useProjectStatus();
  if (!onExport) {
    return (
      <Button variant="outline" size="sm" disabled title={t('shell.soon')}>
        {t('shell.export')}
      </Button>
    );
  }
  return (
    <DeferredDropdownMenu
      trigger={
        <Button variant="outline" size="sm">
          {t('shell.export')}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      }
    >
      {({ DropdownMenuContent, DropdownMenuItem }, content) => (
        <DropdownMenuContent align="end" {...content}>
          <DropdownMenuItem onSelect={() => onExport()}>
            {t('shell.exportProject')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      )}
    </DeferredDropdownMenu>
  );
}
