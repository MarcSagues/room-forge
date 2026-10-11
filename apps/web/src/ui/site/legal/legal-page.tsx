import type { ReactNode } from 'react';
import type { Locale } from '../../i18n';
import { siteMessages } from '../site-messages';
import type { LegalDocument } from './legal-document';

/** "10 October 2026" / "10 de octubre de 2026". UTC, so the build machine's zone does not matter. */
function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** The column of a public text page: title, optional notices, then the content. */
export function ProsePage({
  title,
  children,
  notices,
}: {
  title: string;
  notices?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <h1 className="font-semibold text-4xl tracking-tight">{title}</h1>
      {notices}
      {children}
    </article>
  );
}

/** A privacy policy or terms page: plain text paragraphs (never HTML) under `h2` sections. */
export function LegalPage({ doc, locale }: { doc: LegalDocument; locale: Locale }) {
  const t = siteMessages[locale].legal;
  return (
    <ProsePage
      title={doc.title}
      notices={
        <>
          <p className="text-fg-muted text-sm">
            {t.updated.replace('{date}', formatDate(doc.updated, locale))} · {t.reference}
          </p>
          {doc.draft && (
            <p role="note" className="rounded-md border border-warning px-4 py-3 text-sm">
              {t.draft}
            </p>
          )}
        </>
      }
    >
      {doc.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="font-semibold text-2xl">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-fg-muted leading-relaxed">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </ProsePage>
  );
}
