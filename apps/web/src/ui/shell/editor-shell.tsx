'use client';

import type { EditorSession } from '@roomforge/core';
import { XIcon } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Group,
  Panel,
  type PanelSize,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels';
import { createShortcutRegistry, type ShortcutRegistry } from '@/editor';
import { Button } from '@/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs';
import { translate } from '@/ui/i18n';
import { cn } from '@/ui/lib/utils';
import { ErrorBoundary } from '@/ui/resilience/error-boundary';
import { PanelFallback } from '@/ui/resilience/failure-screen';
import { ShortcutsProvider } from '@/ui/shortcuts/shortcuts-context';
import { BottomBar } from './bottom-bar';
import { SHELL_LAYOUT_ID, safeLayoutStorage } from './layout-storage';
import { PanelHeader, PanelHint, SidePanel } from './side-panel';
import { TopBar } from './top-bar';
import { usePanelHotkeys } from './use-panel-hotkeys';
import { useShellMode } from './use-shell-mode';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

const LEFT_ID = 'rf-panel-left';
const RIGHT_ID = 'rf-panel-right';

/** Panel widths in px (DESIGN_SYSTEM §3); narrower defaults between 1024 and 1279 px. */
export const PANEL_SIZES = {
  left: { wide: 280, narrow: 240, min: 240, max: 360 },
  right: { wide: 300, narrow: 260, min: 260, max: 380 },
} as const;

/**
 * Editor layout: top bar, catalog, viewport, properties and bottom bar.
 * `viewport` is the content of the central region (the R3F canvas, mounted by the app); the ui
 * module does not import the scene engine.
 */
export function EditorShell({
  viewport,
  properties,
  catalog,
  session,
  shortcuts,
  onPanelError,
}: {
  viewport?: ReactNode;
  /** Content of the Properties tab (the app passes the selection details); a hint by default. */
  properties?: ReactNode;
  /** Content of the left panel (the app passes the catalog panel); a hint by default. */
  catalog?: ReactNode;
  /** The editor session, for the undo and redo buttons; they are placeholders without it. */
  session?: EditorSession;
  /** The shortcut registry the app fills with its shortcuts; the shell listens for keys with it. */
  shortcuts?: ShortcutRegistry;
  /** Told about an error inside a panel, with the panel's name (the app logs it). */
  onPanelError?: (error: Error, panel: string) => void;
}) {
  const { mode, wide } = useShellMode();
  const fallback = useMemo(() => (shortcuts ? null : createShortcutRegistry()), [shortcuts]);
  const registry = shortcuts ?? (fallback as ShortcutRegistry);
  useEffect(() => registry.attach(window), [registry]);

  // A panel that throws shows a fallback of its own: the others, the bars and the document go on.
  const guard = (panel: string, node: ReactNode) =>
    node === undefined ? undefined : (
      <Guarded panel={panel} onError={onPanelError}>
        {node}
      </Guarded>
    );
  const guardedViewport = guard(t('shell.viewport'), viewport);
  const guardedProperties = guard(t('shell.properties'), properties);
  const guardedCatalog = guard(t('shell.catalog'), catalog);

  let shell: ReactNode;
  if (mode === 'viewer') shell = <ViewerShell viewport={guardedViewport} />;
  else if (mode === 'full') {
    shell = (
      <DockedShell
        wide={wide}
        viewport={guardedViewport}
        properties={guardedProperties}
        catalog={guardedCatalog}
        session={session}
      />
    );
  } else {
    shell = (
      <DrawerShell
        viewport={guardedViewport}
        properties={guardedProperties}
        catalog={guardedCatalog}
        session={session}
      />
    );
  }
  return <ShortcutsProvider registry={registry}>{shell}</ShortcutsProvider>;
}

function Guarded(props: {
  panel: string;
  onError: ((error: Error, panel: string) => void) | undefined;
  children: ReactNode;
}) {
  const { panel, onError, children } = props;
  return (
    <ErrorBoundary
      onError={(error) => onError?.(error, panel)}
      fallback={({ error, reset }) => <PanelFallback panel={panel} error={error} onRetry={reset} />}
    >
      {children}
    </ErrorBoundary>
  );
}

function DockedShell({
  wide,
  viewport,
  properties,
  catalog,
  session,
}: {
  wide: boolean;
  viewport: ReactNode;
  properties: ReactNode;
  catalog: ReactNode;
  session: EditorSession | undefined;
}) {
  const left = useCollapsiblePanel();
  const right = useCollapsiblePanel();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: SHELL_LAYOUT_ID,
    storage: safeLayoutStorage,
  });
  usePanelHotkeys({ left: left.toggle, right: right.toggle });

  const size = wide ? 'wide' : 'narrow';
  return (
    <ShellFrame
      session={session}
      leftExpanded={left.expanded}
      rightExpanded={right.expanded}
      onToggleLeft={left.toggle}
      onToggleRight={right.toggle}
    >
      <Group
        id={SHELL_LAYOUT_ID}
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1"
      >
        <Panel
          id="left"
          panelRef={left.ref}
          collapsible
          collapsedSize={0}
          defaultSize={PANEL_SIZES.left[size]}
          minSize={PANEL_SIZES.left.min}
          maxSize={PANEL_SIZES.left.max}
          onResize={left.onResize}
        >
          <CatalogSidebar hidden={!left.expanded} className="border-r">
            {catalog}
          </CatalogSidebar>
        </Panel>
        <ResizeHandle />
        <Panel id="viewport" minSize={320}>
          <Viewport>{viewport}</Viewport>
        </Panel>
        <ResizeHandle />
        <Panel
          id="right"
          panelRef={right.ref}
          collapsible
          collapsedSize={0}
          defaultSize={PANEL_SIZES.right[size]}
          minSize={PANEL_SIZES.right.min}
          maxSize={PANEL_SIZES.right.max}
          onResize={right.onResize}
        >
          <PropertiesPanel hidden={!right.expanded} className="border-l">
            {properties}
          </PropertiesPanel>
        </Panel>
      </Group>
    </ShellFrame>
  );
}

/** 768–1023 px: the panels open as drawers over the viewport instead of taking its width. */
function DrawerShell({
  viewport,
  properties,
  catalog,
  session,
}: {
  viewport: ReactNode;
  properties: ReactNode;
  catalog: ReactNode;
  session: EditorSession | undefined;
}) {
  const [open, setOpen] = useState<'left' | 'right' | null>(null);
  const toggleLeft = useCallback(() => setOpen((o) => (o === 'left' ? null : 'left')), []);
  const toggleRight = useCallback(() => setOpen((o) => (o === 'right' ? null : 'right')), []);
  const close = useCallback(() => setOpen(null), []);
  usePanelHotkeys({ left: toggleLeft, right: toggleRight });

  return (
    <ShellFrame
      session={session}
      leftExpanded={open === 'left'}
      rightExpanded={open === 'right'}
      onToggleLeft={toggleLeft}
      onToggleRight={toggleRight}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Escape closes the open drawer; the drawers keep their own close buttons. */}
      <div
        className="relative min-h-0 flex-1"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) close();
        }}
      >
        <Drawer side="left" open={open === 'left'} onClose={close}>
          <CatalogSidebar hidden={open !== 'left'}>{catalog}</CatalogSidebar>
        </Drawer>
        <Viewport>{viewport}</Viewport>
        <Drawer side="right" open={open === 'right'} onClose={close}>
          <PropertiesPanel hidden={open !== 'right'}>{properties}</PropertiesPanel>
        </Drawer>
      </div>
    </ShellFrame>
  );
}

/** < 768 px: view-only, no panels or editing chrome (DESIGN_SYSTEM §3). */
function ViewerShell({ viewport }: { viewport: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <p role="status" className="shrink-0 border-b bg-card px-4 py-2 text-center text-fg-muted">
        {t('shell.viewerBanner')}
      </p>
      <Viewport>{viewport}</Viewport>
    </div>
  );
}

interface ShellFrameProps {
  session: EditorSession | undefined;
  leftExpanded: boolean;
  rightExpanded: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  children: ReactNode;
}

function ShellFrame({ children, ...topBar }: ShellFrameProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar {...topBar} leftPanelId={LEFT_ID} rightPanelId={RIGHT_ID} />
      {children}
      <BottomBar />
    </div>
  );
}

function Drawer(props: {
  side: 'left' | 'right';
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { side, open, onClose, children } = props;
  return (
    <div
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'absolute inset-y-0 z-20 flex w-72 shadow-lg transition-transform duration-200 motion-reduce:transition-none',
        side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
        !open && (side === 'left' ? '-translate-x-full' : 'translate-x-full'),
      )}
    >
      {children}
      {open && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-1.5 right-1.5"
          aria-label={t('shell.closeDrawer')}
          onClick={onClose}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}

function CatalogSidebar({
  hidden,
  className,
  children,
}: {
  hidden: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <SidePanel id={LEFT_ID} label={t('shell.leftPanel')} hidden={hidden} className={className}>
      <PanelHeader>{t('shell.catalog')}</PanelHeader>
      {children ?? <PanelHint>{t('shell.catalogHint')}</PanelHint>}
    </SidePanel>
  );
}

function PropertiesPanel({
  hidden,
  className,
  children,
}: {
  hidden: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <SidePanel id={RIGHT_ID} label={t('shell.rightPanel')} hidden={hidden} className={className}>
      <Tabs defaultValue="properties" className="min-h-0 flex-1 gap-0">
        <div className="flex h-10 shrink-0 items-center border-b px-2">
          <TabsList variant="line">
            <TabsTrigger value="properties">{t('shell.properties')}</TabsTrigger>
            <TabsTrigger value="scene">{t('shell.scene')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="properties">
          {children ?? <PanelHint>{t('shell.propertiesHint')}</PanelHint>}
        </TabsContent>
        <TabsContent value="scene">
          <PanelHint>{t('shell.sceneHint')}</PanelHint>
        </TabsContent>
      </Tabs>
    </SidePanel>
  );
}

/** Focusable so keyboard users reach it in order. Shows a hint when no canvas is mounted. */
function Viewport({ children }: { children?: ReactNode }) {
  return (
    <main
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the viewport will take keyboard input (P3-08).
      tabIndex={0}
      aria-label={t('shell.viewport')}
      className="relative flex h-full min-h-0 flex-1 items-center justify-center bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      {children ?? <p className="text-fg-subtle">{t('shell.viewportHint')}</p>}
    </main>
  );
}

function ResizeHandle() {
  return (
    <Separator className="relative w-px bg-border outline-none transition-colors after:absolute after:inset-y-0 after:-left-1 after:w-2 hover:bg-ember focus-visible:bg-ember" />
  );
}

/**
 * Expanded state is ours (it drives `aria-expanded` and `inert`); the panel follows it through the
 * imperative API, and dragging a panel shut reports back through `onResize`.
 */
function useCollapsiblePanel() {
  const ref = usePanelRef();
  const [expanded, setExpanded] = useState(true);
  const toggle = useCallback(() => {
    if (expanded) ref.current?.collapse();
    else ref.current?.expand();
    setExpanded(!expanded);
  }, [expanded, ref]);
  const onResize = useCallback((size: PanelSize) => setExpanded(size.inPixels > 0), []);
  return { ref, expanded, toggle, onResize };
}
