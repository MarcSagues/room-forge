/**
 * Where the public site lives, read once at build time (static export: no server to ask later).
 * `SITE_URL` is set by the production build (P8-03). Without it the build is a preview: canonical
 * URLs point at a placeholder and robots.txt keeps crawlers out, so a preview is never indexed.
 */
export const PLACEHOLDER_SITE_URL = 'https://roomforge.example';

export interface SiteConfig {
  /** Origin without a trailing slash, e.g. `https://roomforge.app`. */
  readonly url: string;
  /** Only a build with a real `SITE_URL` may be indexed by search engines. */
  readonly indexable: boolean;
}

/** Reads the configuration from `env`; an invalid or non-http(s) URL counts as unset. */
export function readSiteConfig(env: Record<string, string | undefined>): SiteConfig {
  const raw = env.SITE_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return { url: url.origin, indexable: true };
      }
    } catch {
      // Falls through to the preview configuration.
    }
  }
  return { url: PLACEHOLDER_SITE_URL, indexable: false };
}

export const site: SiteConfig = readSiteConfig(process.env);

/** Public pages, by locale. The editor, the project list and shared views are not listed. */
export const PUBLIC_PAGES = {
  home: { en: '/', es: '/es/' },
} as const;

export type PublicPage = keyof typeof PUBLIC_PAGES;

/** `/es/` → `https://roomforge.app/es/`. */
export function absoluteUrl(path: string, config: SiteConfig = site): string {
  return new URL(path, `${config.url}/`).toString();
}
