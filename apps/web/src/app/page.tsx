import type { Metadata } from 'next';
import { Landing, SitePage, siteMessages } from '@/ui';
import { pageMetadata } from './seo';
import { PUBLIC_PAGES } from './site-config';

export const metadata: Metadata = pageMetadata('home', 'en', siteMessages.en.meta);

// The landing page must not load three.js (ADR-0002): the editor is a separate route.
export default function HomePage() {
  return (
    <SitePage locale="en" alternateHref={PUBLIC_PAGES.home.es}>
      <Landing locale="en" />
    </SitePage>
  );
}
