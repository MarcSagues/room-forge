import type { Metadata } from 'next';
import { Landing, SitePage, siteMessages } from '@/ui';
import { pageMetadata } from '../seo';

export const metadata: Metadata = pageMetadata('home', 'es', siteMessages.es.meta);

/** The landing page in Spanish. The editor itself is in English for now. */
export default function SpanishHomePage() {
  return (
    <SitePage locale="es" page="home">
      <Landing locale="es" />
    </SitePage>
  );
}
