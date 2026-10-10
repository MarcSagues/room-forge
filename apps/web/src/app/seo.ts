import type { Metadata, MetadataRoute } from 'next';
import type { Locale } from '@/ui';
import { absoluteUrl, PUBLIC_PAGES, type PublicPage, type SiteConfig } from './site-config';

const OG_LOCALE: Record<Locale, string> = { en: 'en_US', es: 'es_ES' };

/** The card image (`og.png/route.tsx`), shared by every public page. */
export const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'RoomForge' } as const;

/**
 * Title, description, canonical URL, `hreflang` alternates and the Open Graph / Twitter card of a
 * public page. Relative URLs resolve against `metadataBase` (the root layout).
 */
export function pageMetadata(
  page: PublicPage,
  locale: Locale,
  text: { title: string; description: string },
): Metadata {
  const paths = PUBLIC_PAGES[page];
  const url = paths[locale];
  return {
    title: { absolute: text.title },
    description: text.description,
    alternates: {
      canonical: url,
      languages: { en: paths.en, es: paths.es, 'x-default': paths.en },
    },
    openGraph: {
      type: 'website',
      siteName: 'RoomForge',
      url,
      locale: OG_LOCALE[locale],
      title: text.title,
      description: text.description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: text.title,
      description: text.description,
      images: [OG_IMAGE],
    },
  };
}

/**
 * Crawlers may read the public pages but not the app routes: the editor and project list are
 * shells without content, and a shared view (`/view/#…`) belongs to whoever shared it. A preview
 * build (no `SITE_URL`) is closed to every crawler.
 */
export function robotsFor(config: SiteConfig): MetadataRoute.Robots {
  if (!config.indexable) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/editor/', '/projects/', '/view/'] },
    sitemap: absoluteUrl('/sitemap.xml', config),
  };
}

/** Every public page in every language, each listing its translations. */
export function sitemapFor(config: SiteConfig): MetadataRoute.Sitemap {
  return Object.values(PUBLIC_PAGES).flatMap((paths) =>
    Object.values(paths).map((path) => ({
      url: absoluteUrl(path, config),
      alternates: {
        languages: { en: absoluteUrl(paths.en, config), es: absoluteUrl(paths.es, config) },
      },
    })),
  );
}
