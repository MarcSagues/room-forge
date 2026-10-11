import type { TemplateId } from '@roomforge/core';
import type { MessageKey } from '@/ui/i18n';

/** The words of each template: its name (also the new project's name) and what it holds. */
export const TEMPLATE_TEXTS: Readonly<Record<TemplateId, { name: MessageKey; hint: MessageKey }>> =
  {
    empty: { name: 'templates.empty.name', hint: 'templates.empty.hint' },
    gaming: { name: 'templates.gaming.name', hint: 'templates.gaming.hint' },
    office: { name: 'templates.office.name', hint: 'templates.office.hint' },
    streaming: { name: 'templates.streaming.name', hint: 'templates.streaming.hint' },
  };
