import { describe, expect, it } from 'vitest';
import { legalMetadata, pageMetadata, robotsFor, sitemapFor } from './seo';
import { absoluteUrl, PLACEHOLDER_SITE_URL, readSiteConfig } from './site-config';

const production = { url: 'https://rooms.test', indexable: true };
const preview = { url: PLACEHOLDER_SITE_URL, indexable: false };

describe('readSiteConfig', () => {
  it('takes the origin of SITE_URL and makes the build indexable', () => {
    expect(readSiteConfig({ SITE_URL: ' https://rooms.test/some/path/ ' })).toEqual(production);
  });

  it('falls back to the placeholder, not indexable, without a usable SITE_URL', () => {
    for (const SITE_URL of [undefined, '', 'not a url', 'javascript:alert(1)', 'ftp://x.test']) {
      expect(readSiteConfig({ SITE_URL })).toEqual(preview);
    }
  });
});

describe('absoluteUrl', () => {
  it('joins a path to the configured origin', () => {
    expect(absoluteUrl('/es/', production)).toBe('https://rooms.test/es/');
    expect(absoluteUrl('/', production)).toBe('https://rooms.test/');
  });
});

describe('robotsFor', () => {
  it('lets crawlers read the public pages and points them to the sitemap', () => {
    expect(robotsFor(production)).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/editor/', '/projects/', '/view/'] },
      sitemap: 'https://rooms.test/sitemap.xml',
    });
  });

  it('keeps every crawler out of a preview build', () => {
    expect(robotsFor(preview)).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });
});

describe('sitemapFor', () => {
  it('lists each public page in both languages with its alternates', () => {
    const entries = sitemapFor(production);
    expect(entries.map((entry) => entry.url)).toEqual([
      'https://rooms.test/',
      'https://rooms.test/es/',
      'https://rooms.test/privacy/',
      'https://rooms.test/es/privacidad/',
      'https://rooms.test/terms/',
      'https://rooms.test/es/terminos/',
      'https://rooms.test/licenses/',
      'https://rooms.test/es/licencias/',
    ]);
    expect(entries[1]?.alternates?.languages).toEqual({
      en: 'https://rooms.test/',
      es: 'https://rooms.test/es/',
    });
  });
});

describe('pageMetadata', () => {
  it('sets the canonical URL, the language alternates and the social cards', () => {
    const meta = pageMetadata('home', 'es', { title: 'T', description: 'D' });
    expect(meta.title).toEqual({ absolute: 'T' });
    expect(meta.alternates).toEqual({
      canonical: '/es/',
      languages: { en: '/', es: '/es/', 'x-default': '/' },
    });
    expect(meta.openGraph).toMatchObject({ url: '/es/', locale: 'es_ES', title: 'T' });
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/og.png' })]);
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', description: 'D' });
  });
});

describe('legalMetadata', () => {
  it('suffixes the title with the site name', () => {
    const meta = legalMetadata('privacy', 'es', { title: 'Privacidad', description: 'D' });
    expect(meta.title).toEqual({ absolute: 'Privacidad · RoomForge' });
    expect(meta.alternates?.canonical).toBe('/es/privacidad/');
  });
});
