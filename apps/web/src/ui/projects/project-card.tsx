'use client';

import type { ProjectSummary } from '@roomforge/core';
import { CopyIcon, HouseIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { translate } from '@/ui/i18n';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export interface ProjectCardProps {
  project: ProjectSummary;
  href: string;
  editing: boolean;
  onStartRename(): void;
  onStopRename(): void;
  /** Resolves to a message when the name was refused (the card then stays in edit mode). */
  onRename(name: string): Promise<string | undefined>;
  onDuplicate(): void;
  onDelete(): void;
}

/** One project: a thumbnail (a placeholder until P6-07), its name and date, and its actions. */
export function ProjectCard({
  project,
  href,
  editing,
  onStartRename,
  onStopRename,
  onRename,
  onDuplicate,
  onDelete,
}: ProjectCardProps) {
  const { name } = project;
  const renameButton = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  const [draft, setDraft] = useState(name);
  const [problem, setProblem] = useState<string | undefined>();

  useEffect(() => {
    if (editing) {
      setDraft(name);
      setProblem(undefined);
      field.current?.select();
    } else if (wasEditing.current) {
      // The field is gone: leave the keyboard where it was, on the button that opened it.
      renameButton.current?.focus();
    }
    wasEditing.current = editing;
  }, [editing, name]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim() === name) {
      onStopRename();
      return;
    }
    const refusal = await onRename(draft.trim());
    if (refusal === undefined) return;
    setProblem(refusal);
    field.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onStopRename();
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground">
      <div
        aria-hidden="true"
        className="grid aspect-[4/3] place-items-center rounded-lg bg-muted text-fg-muted"
      >
        <HouseIcon className="size-8" />
      </div>
      {editing ? (
        <form onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-2">
          <Input
            ref={field}
            aria-label={t('projects.renameLabel')}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${project.id}-problem` : undefined}
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
          />
          {problem ? (
            <p id={`${project.id}-problem`} role="alert" className="text-destructive text-sm">
              {problem}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              {t('projects.save')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onStopRename}>
              {t('projects.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <h2 className="truncate font-medium" title={name}>
          {name}
        </h2>
      )}
      <p className="text-fg-muted text-sm">
        {t('projects.edited', { date: dateFormat.format(project.updatedAt) })}
      </p>
      <div className="mt-auto flex items-center gap-1">
        <Link
          href={href}
          aria-label={t('projects.open', { name })}
          className={buttonVariants({ size: 'sm' })}
        >
          {t('projects.openLabel')}
        </Link>
        <Button
          ref={renameButton}
          variant="ghost"
          size="icon-sm"
          aria-label={t('projects.rename', { name })}
          title={t('projects.rename', { name })}
          onClick={onStartRename}
        >
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('projects.duplicate', { name })}
          title={t('projects.duplicate', { name })}
          onClick={onDuplicate}
        >
          <CopyIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('projects.delete', { name })}
          title={t('projects.delete', { name })}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  );
}
