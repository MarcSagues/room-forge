'use client';

import {
  type CatalogProvider,
  createTemplateDocument,
  TEMPLATE_IDS,
  type TemplateId,
} from '@roomforge/core';
import { type FormEvent, useId, useMemo, useState } from 'react';
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

const t = (key: MessageKey) => translate('en', key);

/** The words of each template: its name (also the new project's name) and what it holds. */
export const TEMPLATE_TEXTS: Readonly<Record<TemplateId, { name: MessageKey; hint: MessageKey }>> =
  {
    empty: { name: 'templates.empty.name', hint: 'templates.empty.hint' },
    gaming: { name: 'templates.gaming.name', hint: 'templates.gaming.hint' },
    office: { name: 'templates.office.name', hint: 'templates.office.hint' },
    streaming: { name: 'templates.streaming.name', hint: 'templates.streaming.hint' },
  };

const INITIAL: TemplateId = 'gaming';

export interface TemplateDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Sizes for the plans; the documents themselves are built by the caller on confirm. */
  catalog: CatalogProvider;
  onCreate(id: TemplateId): void;
}

/** "Start from a template" (P8-02): a card per template, with a plan drawn from what it builds. */
export function TemplateDialog({ open, onOpenChange, catalog, onCreate }: TemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open ? (
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
  onCreate(id: TemplateId): void;
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
    onCreate(chosen);
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
