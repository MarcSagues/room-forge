'use client';

import type { ImportError, ParsedProject } from '@roomforge/core';
import { type FormEvent, useState } from 'react';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog';
import { Input } from '@/ui/components/input';
import { translate } from '@/ui/i18n';
import { importErrorMessage } from './import-error-message';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

/** Where an import is: the file is being read, can be imported (a preview), or cannot be. */
export type ImportFlow =
  | { stage: 'reading'; fileName: string }
  | { stage: 'preview'; fileName: string; parsed: ParsedProject; suggestedName: string }
  | { stage: 'error'; fileName: string; error: ImportError };

/** Most technical lines (and unknown catalog ids) shown: a hostile file can have thousands. */
const MAX_LINES = 8;

function formattedDate(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : dateFormat.format(date);
}

export interface ImportDialogProps {
  flow: ImportFlow | undefined;
  /** Saves the project under `name`; resolves to a message when it was refused. */
  onConfirm(name: string): Promise<string | undefined>;
  onClose(): void;
}

/**
 * The import, step by step, in a dialog: what the file holds (nothing is saved until the person
 * says so), or why it cannot be opened, in words that say what to do. It never overwrites: what
 * it saves is always a new project.
 */
export function ImportDialog({ flow, onConfirm, onClose }: ImportDialogProps) {
  return (
    <Dialog open={flow !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        {flow?.stage === 'reading' ? <Reading fileName={flow.fileName} /> : null}
        {flow?.stage === 'preview' ? (
          <Preview
            key={flow.fileName}
            parsed={flow.parsed}
            suggestedName={flow.suggestedName}
            onConfirm={onConfirm}
            onClose={onClose}
          />
        ) : null}
        {flow?.stage === 'error' ? <Failure error={flow.error} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Reading({ fileName }: { fileName: string }) {
  return (
    <DialogHeader>
      <DialogTitle>{t('projects.importTitle')}</DialogTitle>
      <DialogDescription>{t('projects.importReading', { file: fileName })}</DialogDescription>
    </DialogHeader>
  );
}

function Preview({
  parsed,
  suggestedName,
  onConfirm,
  onClose,
}: {
  parsed: ParsedProject;
  suggestedName: string;
  onConfirm(name: string): Promise<string | undefined>;
  onClose(): void;
}) {
  const [name, setName] = useState(suggestedName);
  const [problem, setProblem] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const exportedAt = formattedDate(parsed.exportedAt);
  const unknown = parsed.unknownCatalogIds;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const refusal = await onConfirm(name.trim());
    setBusy(false);
    if (refusal !== undefined) setProblem(refusal);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t('projects.importTitle')}</DialogTitle>
        <DialogDescription>{t('projects.importIntro')}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Input
          aria-label={t('projects.importName')}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? 'import-name-problem' : undefined}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {problem ? (
          <p id="import-name-problem" role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">{t('projects.importRooms')}</dt>
        <dd>{Object.keys(parsed.document.rooms).length}</dd>
        <dt className="text-fg-muted">{t('projects.importObjects')}</dt>
        <dd>{Object.keys(parsed.document.objects).length}</dd>
      </dl>
      <p className="text-fg-muted text-xs">
        {parsed.appVersion !== undefined
          ? t('projects.importWrittenBy', { version: parsed.appVersion })
          : null}
        {parsed.appVersion !== undefined && exportedAt !== undefined ? ' · ' : null}
        {exportedAt !== undefined ? t('projects.importExportedAt', { date: exportedAt }) : null}
      </p>
      {parsed.migratedFrom !== undefined ? <p>{t('projects.importMigrated')}</p> : null}
      {unknown.length > 0 ? (
        <div className="rounded-lg border border-warning px-3 py-2">
          <p>{t('projects.importUnknown')}</p>
          <ul className="mt-1 font-mono text-xs">
            {unknown.slice(0, MAX_LINES).map((id) => (
              <li key={id}>{id}</li>
            ))}
            {unknown.length > MAX_LINES ? <li>…</li> : null}
          </ul>
        </div>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('projects.cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {t('projects.importConfirm')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Failure({ error, onClose }: { error: ImportError; onClose(): void }) {
  const lines = [...new Set(error.details)].slice(0, MAX_LINES);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('projects.importTitle')}</DialogTitle>
        <DialogDescription>{importErrorMessage(error)}</DialogDescription>
      </DialogHeader>
      {error.found !== undefined && error.supported !== undefined ? (
        <p className="text-fg-muted">
          {t('projects.importVersions', { found: error.found, supported: error.supported })}
        </p>
      ) : null}
      <p>{t('projects.importUntouched')}</p>
      {lines.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-fg-muted">{t('projects.importDetails')}</summary>
          <ul className="mt-1 font-mono text-xs">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          {t('projects.importClose')}
        </Button>
      </DialogFooter>
    </>
  );
}
