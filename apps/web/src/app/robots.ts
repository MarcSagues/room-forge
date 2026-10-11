import type { MetadataRoute } from 'next';
import { robotsFor } from './seo';
import { site } from './site-config';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return robotsFor(site);
}
