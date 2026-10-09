'use client';

import { LIMITS } from '@roomforge/core';
import { FolderOpenIcon } from 'lucide-react';
import Link from 'next/link';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { buttonVariants } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { translate } from '@/ui/i18n';
import { repositoryErrorMessage } from '@/ui/projects/error-message';
import { useProjectStatus } from './project-status';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

/**
 * The open project's name in the top bar. With a way to rename it, the name is a button that turns
 * into a field: Enter or leaving the field saves, Esc cancels, and a refused name keeps the field
 * open with the reason. Without one it is the link back to all the projects it always was.
 */
export function ProjectName() {
  const { name, onRename } = useProjectStatus();
  const label = name ?? t('shell.project');
  if (!onRename) {
    return (
      <Link
        href="/projects/"
        title={t('shell.projectsLink')}
        className="truncate rounded-sm text-fg-muted hover:text-foreground"
      >
        {label}
      </Link>
    );
  }
  return (
    <>
      <Link
        href="/projects/"
        aria-label={t('shell.projectsLink')}
        title={t('shell.projectsLink')}
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <FolderOpenIcon />
      </Link>
      <EditableName name={label} onRename={onRename} />
    </>
  );
}

function EditableName({ name, onRename }: { name: string; onRename(name: string): Promise<void> }) {
  const problemId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  /** Whether the field is open: once it closes, its blur must not save again. */
  const open = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [problem, setProblem] = useState<string | undefined>();
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) field.current?.select();
    // The field is gone: the keyboard goes back to the name it came from.
    else if (wasEditing.current) button.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const close = () => {
    open.current = false;
    setEditing(false);
  };

  const start = () => {
    open.current = true;
    setDraft(name);
    setProblem(undefined);
    setEditing(true);
  };

  /** Saves the draft. `leaving`: the field lost the focus, so a refused name is dropped. */
  async function commit(leaving: boolean) {
    if (busy.current) return;
    const next = draft.trim();
    if (next === name) {
      close();
      return;
    }
    if (next.length === 0) {
      if (leaving) close();
      else setProblem(t('project.nameEmpty'));
      return;
    }
    busy.current = true;
    try {
      await onRename(next);
      close();
    } catch (error) {
      if (leaving) close();
      else {
        setProblem(repositoryErrorMessage(error));
        field.current?.focus();
      }
    } finally {
      busy.current = false;
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commit(false);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  if (!editing) {
    return (
      <button
        ref={button}
        type="button"
        aria-label={t('project.rename', { name })}
        title={t('project.rename', { name })}
        onClick={start}
        className="min-w-0 truncate rounded-sm px-1 text-left text-fg-muted hover:bg-muted hover:text-foreground"
      >
        {name}
      </button>
    );
  }
  return (
    <div className="flex min-w-0 flex-col">
      <Input
        ref={field}
        aria-label={t('projects.renameLabel')}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? problemId : undefined}
        maxLength={LIMITS.maxNameLength}
        value={draft}
        autoFocus
        className="h-7 w-56 text-sm"
        onChange={(event) => {
          setDraft(event.target.value);
          setProblem(undefined);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (open.current) void commit(true);
        }}
      />
      {problem ? (
        <p
          id={problemId}
          role="alert"
          className="absolute top-11 rounded-md bg-card px-2 py-1 text-destructive text-xs shadow"
        >
          {problem}
        </p>
      ) : null}
    </div>
  );
}
