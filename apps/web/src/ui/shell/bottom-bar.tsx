import { MagnetIcon, MoonStarIcon, MousePointer2Icon, ScanEyeIcon } from 'lucide-react';
import { Button } from '@/ui/components/button';
import { translate } from '@/ui/i18n';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

/** Bottom bar: tools, view and lighting controls (placeholders until P3-09 / P5-09). */
export function BottomBar() {
  return (
    <footer className="flex h-11 shrink-0 items-center gap-1 border-t bg-card px-3">
      <div role="toolbar" aria-label={t('shell.tools')} className="flex items-center gap-1">
        <Button variant="secondary" size="sm" aria-pressed="true" disabled title={t('shell.soon')}>
          <MousePointer2Icon />
          {t('shell.tool.select')}
        </Button>
        <Button variant="ghost" size="sm" disabled title={t('shell.soon')}>
          <MagnetIcon />
          {t('shell.tool.snap')}
        </Button>
        <Button variant="ghost" size="sm" disabled title={t('shell.soon')}>
          <ScanEyeIcon />
          {t('shell.tool.view')}
        </Button>
        <Button variant="ghost" size="sm" disabled title={t('shell.soon')}>
          <MoonStarIcon />
          {t('shell.tool.daynight')}
        </Button>
      </div>
    </footer>
  );
}
