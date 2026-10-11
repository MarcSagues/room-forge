import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '../components/button';
import type { Locale } from '../i18n';
import { siteMessages } from './site-messages';

export interface SitePageProps {
  readonly locale: Locale;
  /** The same page in the other language, for the language link and `hreflang`. */
  readonly alternateHref: string;
  readonly children: ReactNode;
}

const OTHER: Record<Locale, Locale> = { en: 'es', es: 'en' };

/**
 * Header, main landmark and footer of a public page (landing, legal pages). A server component:
 * it ships no JavaScript of its own. `lang` marks the language of everything inside.
 */
export function SitePage({ locale, alternateHref, children }: SitePageProps) {
  const t = siteMessages[locale];
  const other = OTHER[locale];
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
          <Link href={locale === 'en' ? '/' : '/es/'} className="font-semibold text-lg">
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
            <a
              href={alternateHref}
              hrefLang={siteMessages[other].lang}
              lang={siteMessages[other].lang}
              aria-label={t.otherLocale.label}
              className="underline-offset-4 hover:text-fg hover:underline"
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
