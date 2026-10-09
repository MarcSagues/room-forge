'use client';

import {
  createNanoIdGen,
  type IdGen,
  type ProjectId,
  ProjectIdSchema,
  type ProjectRepository,
  type ProjectSummary,
  type SceneDocument,
} from '@roomforge/core';
import { PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { translate } from '@/ui/i18n';
import { repositoryErrorMessage } from './error-message';
import { matchesQuery, uniqueName } from './names';
import { ProjectCard } from './project-card';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

/** How long a deleted project can be brought back before it is really deleted. */
export const UNDO_MS = 8_000;

export interface ProjectsScreenProps {
  repository: ProjectRepository;
  /** The document a new project starts with. */
  createDocument(): SceneDocument;
  generateId?: IdGen;
  /** `memory` when the browser stores nothing: the person is told up front. */
  storage: 'indexeddb' | 'memory';
  /** Where "Open" goes. */
  openHref?(id: ProjectId): string;
  undoMs?: number;
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
}: ProjectsScreenProps) {
  const makeId = useMemo(() => generateId ?? createNanoIdGen(), [generateId]);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pending, setPending] = useState<ProjectSummary[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ProjectId | undefined>();
  const [announcement, setAnnouncement] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const [focusRequest, setFocusRequest] = useState(0);
  const region = useRef<HTMLElement>(null);
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

  const pendingIds = useMemo(() => new Set(pending.map((project) => project.id)), [pending]);
  const visible = useMemo(
    () =>
      projects.filter(
        (project) => !pendingIds.has(project.id) && matchesQuery(project.name, query),
      ),
    [projects, pendingIds, query],
  );
  const hasProjects = projects.some((project) => !pendingIds.has(project.id));

  async function create() {
    setProblem(undefined);
    const name = uniqueName(
      t('projects.untitled'),
      [...projects, ...pending].map((project) => project.name),
    );
    try {
      const saved = await repository.save({
        id: ProjectIdSchema.parse(makeId()),
        name,
        document: createDocument(),
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-3xl tracking-tight">{t('projects.title')}</h1>
        <Button onClick={() => void create()}>
          <PlusIcon />
          {t('projects.new')}
        </Button>
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
            <Button onClick={() => void create()}>
              <PlusIcon />
              {t('projects.new')}
            </Button>
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
    </main>
  );
}
