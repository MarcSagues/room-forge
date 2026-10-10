'use client';

import {
  ANGLE_STEPS_DEG,
  type AngleStepDeg,
  type EditorSession,
  GRID_STEPS,
  type GridStep,
  WALL_MODES,
  type WallMode,
} from '@roomforge/core';
import {
  BoxIcon,
  ChevronDownIcon,
  LightbulbIcon,
  MagnetIcon,
  MoonStarIcon,
  MousePointer2Icon,
  RotateCwIcon,
  SquareIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/ui/components/button';
import { DeferredDropdownMenu } from '@/ui/components/deferred-dropdown-menu';
import { Separator } from '@/ui/components/separator';
import { TooltipProvider } from '@/ui/components/tooltip';
import { type MessageKey, translate } from '@/ui/i18n';
import { ShortcutTooltip } from '@/ui/shortcuts/shortcut-tooltip';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

const cm = (metres: number) => `${Math.round(metres * 100)} cm`;
const deg = (degrees: number) => `${degrees}°`;
const wallName = (mode: WallMode) => t(`bar.wall.${mode}` as MessageKey);

/**
 * Bottom bar (DESIGN_SYSTEM §3): the tool, snap on/off with its grid size, the turn step, the view
 * and the walls, all read from and written to the session. Day/night and the lights are
 * placeholders until P5-09. Without a session every control is a disabled placeholder.
 */
export function BottomBar({ session }: { session?: EditorSession | undefined }) {
  return (
    <TooltipProvider delayDuration={400}>
      <footer className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-t bg-card px-3">
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">{t('shell.tools')}</legend>
          <Button variant="secondary" size="sm" aria-pressed="true">
            <MousePointer2Icon />
            {t('shell.tool.select')}
          </Button>
        </fieldset>
        <Separator orientation="vertical" className="mx-1 h-5" />
        {session ? <SessionControls session={session} /> : <Placeholders />}
        <Separator orientation="vertical" className="mx-1 h-5" />
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">{t('bar.lighting')}</legend>
          <Button variant="ghost" size="sm" disabled title={t('shell.soon')}>
            <MoonStarIcon />
            {t('shell.tool.daynight')}
          </Button>
          <Button variant="ghost" size="sm" disabled title={t('shell.soon')}>
            <LightbulbIcon />
            {t('bar.lights')}
          </Button>
        </fieldset>
      </footer>
    </TooltipProvider>
  );
}

function SessionControls({ session }: { session: EditorSession }) {
  const snap = useStore(session.store, (state) => state.snap);
  return (
    <>
      <fieldset className="flex items-center gap-1">
        <legend className="sr-only">{t('bar.snapGroup')}</legend>
        <ShortcutTooltip label={t('bar.snap')} shortcutId="edit.snap">
          <Button
            variant={snap.enabled ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={snap.enabled}
            onClick={() => session.setSnap({ enabled: !snap.enabled })}
          >
            <MagnetIcon />
            {t('bar.snap')}
          </Button>
        </ShortcutTooltip>
        <StepMenu
          label={t('bar.gridSize', { size: cm(snap.gridStep) })}
          menuLabel={t('bar.gridSizeMenu')}
          value={snap.gridStep}
          options={GRID_STEPS}
          format={cm}
          onChange={(gridStep) => session.setSnap({ gridStep: gridStep as GridStep })}
        />
        <StepMenu
          icon={<RotateCwIcon />}
          label={t('bar.turnStep', { step: deg(snap.angleStepDeg) })}
          menuLabel={t('bar.turnStepMenu')}
          value={snap.angleStepDeg}
          options={ANGLE_STEPS_DEG}
          format={deg}
          onChange={(angleStepDeg) =>
            session.setSnap({ angleStepDeg: angleStepDeg as AngleStepDeg })
          }
        />
      </fieldset>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ViewControls session={session} />
    </>
  );
}

/** Perspective or top view, and how walls show: all a viewer of a shared room may change too. */
export function ViewControls({ session }: { session: EditorSession }) {
  const { view, wallMode } = useStore(
    session.store,
    useShallow((state) => ({ view: state.view, wallMode: state.wallMode })),
  );
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">{t('bar.view')}</legend>
      <ShortcutTooltip label={t('bar.perspective')} shortcutId="view.perspective">
        <Button
          variant={view === 'perspective' ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={view === 'perspective'}
          onClick={() => session.setView('perspective')}
        >
          <BoxIcon />
          {t('bar.perspective')}
        </Button>
      </ShortcutTooltip>
      <ShortcutTooltip label={t('bar.top')} shortcutId="view.top">
        <Button
          variant={view === 'top' ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={view === 'top'}
          onClick={() => session.setView('top')}
        >
          <SquareIcon />
          {t('bar.top')}
        </Button>
      </ShortcutTooltip>
      <ShortcutTooltip label={t('bar.wallsMenu')} shortcutId="view.walls">
        <DeferredDropdownMenu
          trigger={
            <Button variant="ghost" size="sm">
              {t('bar.walls', { mode: wallName(wallMode) })}
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          }
        >
          {(menu, content) => (
            <menu.DropdownMenuContent align="start" side="top" {...content}>
              <menu.DropdownMenuLabel>{t('bar.wallsMenu')}</menu.DropdownMenuLabel>
              <menu.DropdownMenuRadioGroup
                value={wallMode}
                onValueChange={(mode) => session.setWallMode(mode as WallMode)}
              >
                {WALL_MODES.map((mode) => (
                  <menu.DropdownMenuRadioItem key={mode} value={mode}>
                    {wallName(mode)}
                  </menu.DropdownMenuRadioItem>
                ))}
              </menu.DropdownMenuRadioGroup>
            </menu.DropdownMenuContent>
          )}
        </DeferredDropdownMenu>
      </ShortcutTooltip>
    </fieldset>
  );
}

/** A button showing the current step that opens a menu of the steps offered. */
function StepMenu({
  icon,
  label,
  menuLabel,
  value,
  options,
  format,
  onChange,
}: {
  icon?: ReactNode;
  label: string;
  menuLabel: string;
  value: number;
  options: readonly number[];
  format(value: number): string;
  onChange(value: number): void;
}) {
  return (
    <DeferredDropdownMenu
      trigger={
        <Button variant="ghost" size="sm" aria-label={label} title={label}>
          {icon}
          {format(value)}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      }
    >
      {(menu, content) => (
        <menu.DropdownMenuContent align="start" side="top" {...content}>
          <menu.DropdownMenuLabel>{menuLabel}</menu.DropdownMenuLabel>
          <menu.DropdownMenuRadioGroup
            value={String(value)}
            onValueChange={(next) => onChange(Number(next))}
          >
            {options.map((option) => (
              <menu.DropdownMenuRadioItem key={option} value={String(option)}>
                {format(option)}
              </menu.DropdownMenuRadioItem>
            ))}
          </menu.DropdownMenuRadioGroup>
        </menu.DropdownMenuContent>
      )}
    </DeferredDropdownMenu>
  );
}

/** What the bar shows where there is no editor session (the shell on its own). */
function Placeholders() {
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">{t('bar.snapGroup')}</legend>
      <Button variant="ghost" size="sm" disabled title={t('shell.soon')}>
        <MagnetIcon />
        {t('bar.snap')}
      </Button>
      <Button variant="ghost" size="sm" disabled title={t('shell.soon')}>
        <BoxIcon />
        {t('bar.perspective')}
      </Button>
    </fieldset>
  );
}
