import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '../components/button';
import { FeedbackButton } from '../feedback';
import type { Locale } from '../i18n';
import { PUBLIC_PAGES, type PublicPage } from './routes';
import { siteMessages } from './site-messages';

export interface SitePageProps {
  readonly locale: Locale;
  /** Which page this is: gives the link to the same page in the other language. */
  readonly page: PublicPage;
  readonly children: ReactNode;
}

const OTHER: Record<Locale, Locale> = { en: 'es', es: 'en' };

/**
 * Header, main landmark and footer of a public page (landing, legal pages). A server component:
 * it ships no JavaScript of its own. `lang` marks the language of everything inside.
 */
export function SitePage({ locale, page, children }: SitePageProps) {
  const t = siteMessages[locale];
  const other = OTHER[locale];
  const linkClass = 'underline-offset-4 hover:text-fg hover:underline';
  return (
    <div lang={t.lang} className="flex min-h-dvh flex-col bg-canvas text-fg">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-elevated focus:px-3 focus:py-2"
      >
        {t.skipToContent}
      </a>
      <header className="border-subtle border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <Link href={PUBLIC_PAGES.home[locale]} className="font-semibold text-lg">
            RoomForge
          </Link>
          <nav aria-label={t.nav.label} className="flex flex-wrap items-center gap-2">
            <Link href="/projects/" className={buttonVariants({ variant: 'ghost' })}>
              {t.nav.projects}
            </Link>
            <Link href="/editor/" prefetch={false} className={buttonVariants()}>
              {t.nav.editor}
            </Link>
          </nav>
        </div>
      </header>
      <main id="content" className="flex-1">
        {children}
      </main>
      <footer className="border-subtle border-t text-fg-muted text-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <p>{t.footer.tagline}</p>
          <nav aria-label={t.footer.label} className="flex flex-wrap items-center gap-4">
            <Link href={PUBLIC_PAGES.privacy[locale]} className={linkClass}>
              {t.footer.privacy}
            </Link>
            <Link href={PUBLIC_PAGES.terms[locale]} className={linkClass}>
              {t.footer.terms}
            </Link>
            <Link href={PUBLIC_PAGES.licenses[locale]} className={linkClass}>
              {t.footer.licenses}
            </Link>
            <FeedbackButton locale={locale} variant="link" label={t.footer.feedback} />
            <a
              href={PUBLIC_PAGES[page][other]}
              hrefLang={siteMessages[other].lang}
              lang={siteMessages[other].lang}
              aria-label={t.otherLocale.label}
              className={linkClass}
            >
              {t.otherLocale.name}
            </a>
          </nav>
          <p>{t.footer.rights.replace('{year}', String(new Date().getFullYear()))}</p>
        </div>
      </footer>
    </div>
  );
}
