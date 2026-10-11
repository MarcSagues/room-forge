import type { MetadataRoute } from 'next';
import { sitemapFor } from './seo';
import { site } from './site-config';

export const dynamic = 'force-static';

/** Written at build time into the static export. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapFor(site);
}
