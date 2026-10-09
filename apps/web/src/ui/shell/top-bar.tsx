import { PanelLeftIcon, PanelRightIcon, Redo2Icon, Undo2Icon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/ui/components/button';
import { Separator } from '@/ui/components/separator';
import { ExportMenu } from '@/ui/editor/export-menu';
import { useProjectStatus } from '@/ui/editor/project-status';
import { SaveStatusPill } from '@/ui/editor/save-status';
import { translate } from '@/ui/i18n';

interface TopBarProps {
  leftExpanded: boolean;
  rightExpanded: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  leftPanelId: string;
  rightPanelId: string;
}

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

/** Top bar: navigation, project, save status, history and export (placeholders until P3-09). */
export function TopBar(props: TopBarProps) {
  const { leftExpanded, rightExpanded, onToggleLeft, onToggleRight, leftPanelId, rightPanelId } =
    props;
  const project = useProjectStatus();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3">
      <Button
        variant="ghost"
        size="icon"
        aria-label={leftExpanded ? t('shell.collapseLeft') : t('shell.expandLeft')}
        aria-expanded={leftExpanded}
        aria-controls={leftPanelId}
        onClick={onToggleLeft}
      >
        <PanelLeftIcon />
      </Button>
      <Link href="/" className="rounded-sm font-semibold tracking-tight">
        {t('app.name')}
      </Link>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Link
        href="/projects/"
        title={t('shell.projectsLink')}
        className="truncate rounded-sm text-fg-muted hover:text-foreground"
      >
        {project.name ?? t('shell.project')}
      </Link>
      <SaveStatusPill status={project.save} />
      <div className="ml-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled
          aria-label={t('shell.undo')}
          title={t('shell.soon')}
        >
          <Undo2Icon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled
          aria-label={t('shell.redo')}
          title={t('shell.soon')}
        >
          <Redo2Icon />
        </Button>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <ExportMenu />
        <Button variant="outline" size="sm" disabled title={t('shell.soon')}>
          {t('shell.share')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={rightExpanded ? t('shell.collapseRight') : t('shell.expandRight')}
          aria-expanded={rightExpanded}
          aria-controls={rightPanelId}
          onClick={onToggleRight}
        >
          <PanelRightIcon />
        </Button>
      </div>
    </header>
  );
}
