'use client';

import {
  type CatalogProvider,
  createNanoIdGen,
  createTemplateDocument,
  type IdGen,
  type ImportError,
  LIMITS,
  type ProjectId,
  ProjectIdSchema,
  type ProjectRepository,
  type ProjectSummary,
  type RoomSize,
  type SceneDocument,
  type TemplateId,
} from '@roomforge/core';
import { PlusIcon, UploadIcon } from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { translate } from '@/ui/i18n';
import { SettingsButton, type StorageInfo } from '@/ui/settings/settings-dialog';
import { repositoryErrorMessage } from './error-message';
import { ImportDialog, type ImportFlow } from './import-dialog';
import { matchesQuery, uniqueName } from './names';
import { NewRoomDialog } from './new-room-dialog';
import { ProjectCard } from './project-card';
import type { ProjectFiles } from './project-files';
import { TEMPLATE_TEXTS, TemplateDialog } from './template-dialog';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

/** How long a deleted project can be brought back before it is really deleted. */
export const UNDO_MS = 8_000;

export interface ProjectsScreenProps {
  repository: ProjectRepository;
  /** The document a new project starts with, with a room of `size` (the default one if none). */
  createDocument(size?: RoomSize): SceneDocument;
  generateId?: IdGen;
  /** `memory` when the browser stores nothing: the person is told up front. */
  storage: 'indexeddb' | 'memory';
  /** Where "Open" goes. */
  openHref?(id: ProjectId): string;
  undoMs?: number;
  /** Import and export of project files; without it the screen offers neither. */
  files?: ProjectFiles;
  /** What the settings show about storage; without it there is no Settings button. */
  readStorage?: () => Promise<StorageInfo>;
  /** The catalog the starter templates are built with; without it there is no template choice. */
  templateCatalog?: CatalogProvider;
}

const defaultHref = (id: ProjectId) => `/editor/?project=${encodeURIComponent(id)}`;

type Loaded = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

/** Puts `project` in the list (replacing its old version), newest first. */
function upsert(list: ProjectSummary[], project: ProjectSummary): ProjectSummary[] {
  return [project, ...list.filter((item) => item.id !== project.id)].sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  );
}

/**
 * The projects screen (P6-04): list, search, create, rename, duplicate and delete. Deleting is
 * deferred: the project leaves the list at once and is really deleted after `undoMs`, unless the
 * person undoes it or leaves the screen (which settles what was waiting).
 */
export function ProjectsScreen({
  repository,
  createDocument,
  generateId,
  storage,
  openHref = defaultHref,
  undoMs = UNDO_MS,
  files,
  readStorage,
  templateCatalog,
}: ProjectsScreenProps) {
  const makeId = useMemo(() => generateId ?? createNanoIdGen(), [generateId]);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pending, setPending] = useState<ProjectSummary[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ProjectId | undefined>();
  const [choosingSize, setChoosingSize] = useState(false);
  const [choosingTemplate, setChoosingTemplate] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const [focusRequest, setFocusRequest] = useState(0);
  const [flow, setFlow] = useState<ImportFlow | undefined>();
  const [dragging, setDragging] = useState(false);
  const region = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // The newest flow and the way to start one, for listeners that are not re-registered per render.
  const flowRef = useRef<ImportFlow | undefined>(undefined);
  const startImportRef = useRef<(file: File) => void>(() => {});
  // Bumped when a flow is closed or replaced, so the answer to an abandoned read is ignored.
  const flowToken = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const load = useCallback(() => {
    let cancelled = false;
    setLoaded({ status: 'loading' });
    repository.list().then(
      (list) => {
        if (cancelled) return;
        setProjects(list);
        setLoaded({ status: 'ready' });
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ status: 'error', message: repositoryErrorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => load(), [load]);

  // Whatever was waiting to be deleted is deleted when the screen goes away: the person chose it.
  useEffect(() => {
    const waiting = timers.current;
    const settle = () => {
      for (const [id, timer] of waiting) {
        clearTimeout(timer);
        repository.delete(ProjectIdSchema.parse(id)).catch(() => {});
      }
      waiting.clear();
    };
    window.addEventListener('pagehide', settle);
    return () => {
      window.removeEventListener('pagehide', settle);
      settle();
    };
  }, [repository]);

  useEffect(() => {
    if (focusRequest > 0) region.current?.focus();
  }, [focusRequest]);

  // A project file dropped anywhere on the window is imported; the browser must not open it.
  const canImport = files !== undefined;
  useEffect(() => {
    if (!canImport) return;
    let depth = 0;
    const carriesFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) startImportRef.current(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [canImport]);

  const pendingIds = useMemo(() => new Set(pending.map((project) => project.id)), [pending]);
  const visible = useMemo(
    () =>
      projects.filter(
        (project) => !pendingIds.has(project.id) && matchesQuery(project.name, query),
      ),
    [projects, pendingIds, query],
  );
  const hasProjects = projects.some((project) => !pendingIds.has(project.id));

  async function create(size?: RoomSize, template?: TemplateId) {
    setProblem(undefined);
    const name = uniqueName(
      t(template ? TEMPLATE_TEXTS[template].name : 'projects.untitled'),
      [...projects, ...pending].map((project) => project.name),
    );
    try {
      const document =
        template && templateCatalog
          ? createTemplateDocument(template, templateCatalog)
          : createDocument(size);
      const saved = await repository.save({
        id: ProjectIdSchema.parse(makeId()),
        name,
        document,
      });
      setProjects((list) => upsert(list, saved));
      setQuery('');
      setAnnouncement(t('projects.created', { name: saved.name }));
    } catch (error) {
      setProblem(repositoryErrorMessage(error));
    }
  }

  async function duplicate(project: ProjectSummary) {
    setProblem(undefined);
    try {
      const copy = await repository.duplicate(project.id);
      setProjects((list) => upsert(list, copy));
      setAnnouncement(t('projects.created', { name: copy.name }));
    } catch (error) {
      setProblem(repositoryErrorMessage(error));
    }
  }

  async function rename(project: ProjectSummary, name: string): Promise<string | undefined> {
    try {
      const renamed = await repository.rename(project.id, name);
      setProjects((list) => upsert(list, renamed));
      setEditing(undefined);
      setAnnouncement(t('projects.renamed', { name: renamed.name }));
      return undefined;
    } catch (error) {
      return repositoryErrorMessage(error);
    }
  }

  async function settleDeletion(project: ProjectSummary) {
    timers.current.delete(project.id);
    try {
      await repository.delete(project.id);
      setProjects((list) => list.filter((item) => item.id !== project.id));
    } catch (error) {
      setProblem(repositoryErrorMessage(error));
    } finally {
      setPending((list) => list.filter((item) => item.id !== project.id));
    }
  }

  function remove(project: ProjectSummary) {
    setProblem(undefined);
    setAnnouncement('');
    setEditing(undefined);
    setPending((list) => [...list, project]);
    timers.current.set(
      project.id,
      setTimeout(() => void settleDeletion(project), undoMs),
    );
    setFocusRequest((n) => n + 1);
  }

  function undo(project: ProjectSummary) {
    const timer = timers.current.get(project.id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(project.id);
    setPending((list) => list.filter((item) => item.id !== project.id));
    setAnnouncement(t('projects.restored', { name: project.name }));
    setFocusRequest((n) => n + 1);
  }

  async function exportOne(project: ProjectSummary) {
    if (!files) return;
    setProblem(undefined);
    try {
      await files.exportProject(project.id);
      setAnnouncement(t('projects.exported', { name: project.name }));
    } catch (error) {
      setProblem(repositoryErrorMessage(error));
    }
  }

  async function startImport(file: File) {
    if (!files || flowRef.current) return;
    setProblem(undefined);
    flowToken.current += 1;
    const token = flowToken.current;
    setFlow({ stage: 'reading', fileName: file.name });
    let result: Awaited<ReturnType<ProjectFiles['readFile']>>;
    try {
      result = await files.readFile(file);
    } catch {
      const error: ImportError = { code: 'INVALID_JSON', message: 'unreadable', details: [] };
      result = { ok: false, error };
    }
    if (token !== flowToken.current) return;
    if (!result.ok) {
      setFlow({ stage: 'error', fileName: file.name, error: result.error });
      return;
    }
    const parsed = result.value;
    const base = (parsed.name.trim() || t('projects.untitled')).slice(0, LIMITS.maxNameLength - 4);
    const taken = [...projects, ...pending].map((project) => project.name);
    setFlow({
      stage: 'preview',
      fileName: file.name,
      parsed,
      suggestedName: uniqueName(base, taken),
    });
  }

  async function confirmImport(name: string): Promise<string | undefined> {
    const current = flowRef.current;
    if (current?.stage !== 'preview') return undefined;
    try {
      const saved = await repository.save({
        id: ProjectIdSchema.parse(makeId()),
        name,
        document: current.parsed.document,
      });
      setProjects((list) => upsert(list, saved));
      setQuery('');
      closeImport();
      setAnnouncement(t('projects.imported', { name: saved.name }));
      return undefined;
    } catch (error) {
      return repositoryErrorMessage(error);
    }
  }

  function closeImport() {
    flowToken.current += 1;
    setFlow(undefined);
  }

  function chosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so that choosing the same file again (after fixing it, say) is noticed.
    event.target.value = '';
    if (file) void startImport(file);
  }

  flowRef.current = flow;
  startImportRef.current = (file) => void startImport(file);

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-3xl tracking-tight">{t('projects.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {readStorage ? <SettingsButton readStorage={readStorage} /> : null}
          {files ? (
            <>
              <Button variant="outline" onClick={() => fileInput.current?.click()}>
                <UploadIcon />
                {t('projects.import')}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={chosen}
              />
            </>
          ) : null}
          {templateCatalog ? (
            <Button variant="outline" onClick={() => setChoosingTemplate(true)}>
              {t('templates.open')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setChoosingSize(true)}>
            {t('newRoom.open')}
          </Button>
          <Button onClick={() => void create()}>
            <PlusIcon />
            {t('projects.new')}
          </Button>
        </div>
      </header>

      {storage === 'memory' ? (
        <div role="alert" className="rounded-lg border border-warning bg-card px-4 py-3 text-sm">
          <p className="font-medium">{t('projects.memoryNotice')}</p>
          <p className="text-fg-muted">{t('projects.memoryHint')}</p>
        </div>
      ) : null}

      {problem ? (
        <p role="alert" className="rounded-lg border border-danger bg-card px-4 py-3 text-sm">
          {problem}
        </p>
      ) : null}

      {hasProjects ? (
        <Input
          type="search"
          aria-label={t('projects.search')}
          placeholder={t('projects.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />
      ) : null}

      <section
        ref={region}
        tabIndex={-1}
        aria-label={t('projects.list')}
        aria-busy={loaded.status === 'loading'}
        className="outline-none"
      >
        {loaded.status === 'loading' ? (
          <p className="text-fg-muted">{t('projects.loading')}</p>
        ) : loaded.status === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p>{loaded.message}</p>
            <Button variant="outline" onClick={load}>
              {t('projects.retry')}
            </Button>
          </div>
        ) : !hasProjects ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-8">
            <h2 className="font-medium text-lg">{t('projects.emptyTitle')}</h2>
            <p className="text-fg-muted">{t('projects.emptyHint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void create()}>
                <PlusIcon />
                {t('projects.new')}
              </Button>
              {templateCatalog ? (
                <Button variant="outline" onClick={() => setChoosingTemplate(true)}>
                  {t('templates.open')}
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setChoosingSize(true)}>
                {t('newRoom.open')}
              </Button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-fg-muted">{t('projects.noMatches', { query: query.trim() })}</p>
        ) : (
          <ul
            aria-label={t('projects.list')}
            className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4"
          >
            {visible.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                href={openHref(project.id)}
                editing={editing === project.id}
                onStartRename={() => setEditing(project.id)}
                onStopRename={() => setEditing(undefined)}
                onRename={(name) => rename(project, name)}
                onDuplicate={() => void duplicate(project)}
                {...(files ? { onExport: () => void exportOne(project) } : {})}
                onDelete={() => remove(project)}
              />
            ))}
          </ul>
        )}
      </section>

      <div
        role="status"
        className="fixed inset-x-0 bottom-4 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-col gap-2"
      >
        {pending.map((project) => (
          <p
            key={project.id}
            className="flex items-center gap-3 rounded-lg border bg-popover px-4 py-2 text-popover-foreground text-sm shadow-md"
          >
            <span>{t('projects.deleted', { name: project.name })}</span>
            <Button
              variant="outline"
              size="sm"
              aria-label={t('projects.undoLabel', { name: project.name })}
              onClick={() => undo(project)}
            >
              {t('projects.undo')}
            </Button>
          </p>
        ))}
        <span className="sr-only">{announcement}</span>
      </div>

      <ImportDialog flow={flow} onConfirm={confirmImport} onClose={closeImport} />

      <NewRoomDialog
        open={choosingSize}
        onOpenChange={setChoosingSize}
        onCreate={(size) => {
          setChoosingSize(false);
          void create(size);
        }}
      />

      {templateCatalog ? (
        <TemplateDialog
          open={choosingTemplate}
          onOpenChange={setChoosingTemplate}
          catalog={templateCatalog}
          onCreate={(template) => {
            setChoosingTemplate(false);
            void create(undefined, template);
          }}
        />
      ) : null}

      {dragging ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-xl border-2 border-dashed border-ember bg-background/80 font-medium text-lg"
        >
          {t('projects.dropHint')}
        </div>
      ) : null}
    </main>
  );
}
