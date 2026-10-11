import type { Metadata } from 'next';
import { Landing, SitePage, siteMessages } from '@/ui';
import { pageMetadata } from '../seo';
import { PUBLIC_PAGES } from '../site-config';

export const metadata: Metadata = pageMetadata('home', 'es', siteMessages.es.meta);

/** The landing page in Spanish. The editor itself is in English for now. */
export default function SpanishHomePage() {
  return (
    <SitePage locale="es" alternateHref={PUBLIC_PAGES.home.en}>
      <Landing locale="es" />
    </SitePage>
  );
}
