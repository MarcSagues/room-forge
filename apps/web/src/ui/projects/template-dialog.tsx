'use client';

import {
  type CatalogProvider,
  createTemplateDocument,
  type SceneDocument,
  TEMPLATE_IDS,
  type TemplateId,
} from '@roomforge/core';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog';
import { type MessageKey, translate } from '@/ui/i18n';
import { cn } from '@/ui/lib/utils';
import { TemplatePlan } from './template-plan';
import { TEMPLATE_TEXTS } from './template-texts';

const t = (key: MessageKey) => translate('en', key);

const INITIAL: TemplateId = 'gaming';

export interface TemplateDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The catalog the templates are built with, loaded when the dialog first opens. */
  loadCatalog(): Promise<CatalogProvider>;
  /** Called with the template chosen and a new document built from it, with its own ids. */
  onCreate(id: TemplateId, document: SceneDocument): void;
}

/** "Start from a template" (P8-02): a card per template, with a plan drawn from what it builds. */
export function TemplateDialog({ open, onOpenChange, loadCatalog, onCreate }: TemplateDialogProps) {
  const [catalog, setCatalog] = useState<CatalogProvider | undefined>();
  useEffect(() => {
    let cancelled = false;
    void loadCatalog().then((loaded) => {
      if (!cancelled) setCatalog(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [loadCatalog]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open && !catalog ? (
          <DialogHeader>
            <DialogTitle>{t('templates.title')}</DialogTitle>
            <p role="status" className="text-fg-muted text-sm">
              {t('shell.panelLoading')}
            </p>
          </DialogHeader>
        ) : null}
        {open && catalog ? (
          <TemplateForm
            catalog={catalog}
            onCancel={() => onOpenChange(false)}
            onCreate={onCreate}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({
  catalog,
  onCancel,
  onCreate,
}: {
  catalog: CatalogProvider;
  onCancel(): void;
  onCreate(id: TemplateId, document: SceneDocument): void;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<TemplateId>(INITIAL);
  // Built once per opening, only to be drawn: the project gets its own copy with fresh ids.
  const previews = useMemo(
    () =>
      TEMPLATE_IDS.map(
        (template) => [template, createTemplateDocument(template, catalog)] as const,
      ),
    [catalog],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate(chosen, createTemplateDocument(chosen, catalog));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('templates.title')}</DialogTitle>
        <DialogDescription>{t('templates.description')}</DialogDescription>
      </DialogHeader>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="sr-only">{t('templates.list')}</legend>
        {previews.map(([template, document]) => {
          const texts = TEMPLATE_TEXTS[template];
          const selected = template === chosen;
          return (
            <label
              key={template}
              className={cn(
                'flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                selected ? 'border-primary' : 'hover:border-fg-subtle',
              )}
            >
              <TemplatePlan document={document} catalog={catalog} />
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-template`}
                  value={template}
                  checked={selected}
                  aria-labelledby={`${id}-${template}-name`}
                  aria-describedby={`${id}-${template}-hint`}
                  onChange={() => setChosen(template)}
                  className="accent-primary"
                />
                <span id={`${id}-${template}-name`} className="font-medium">
                  {t(texts.name)}
                </span>
              </span>
              <span id={`${id}-${template}-hint`} className="text-fg-muted text-xs">
                {t(texts.hint)}
              </span>
            </label>
          );
        })}
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('templates.cancel')}
        </Button>
        <Button type="submit">{t('templates.create')}</Button>
      </DialogFooter>
    </form>
  );
}
