import type { Metadata } from 'next';
import { Landing, SitePage, siteMessages } from '@/ui';
import { pageMetadata } from './seo';

export const metadata: Metadata = pageMetadata('home', 'en', siteMessages.en.meta);

// The landing page must not load three.js (ADR-0002): the editor is a separate route.
export default function HomePage() {
  return (
    <SitePage locale="en" page="home">
      <Landing locale="en" />
    </SitePage>
  );
}
