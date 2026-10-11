// The Vercel configuration of the static export, derived from the same `_headers` rules (one source
// of truth for the CSP and caching on any host). Pure: see write-vercel-config.mjs for the file.
import { parseHeaders } from './headers.mjs';

/**
 * Vercel `source` patterns for a `_headers` pattern: `/*` is everything, `/a/*` a prefix, `/a/` a
 * page (also requested as `/a/index.html`). Vercel takes path-to-regexp patterns, not globs.
 */
export function vercelSources(pattern) {
  if (pattern === '/*') return ['/(.*)'];
  if (pattern.endsWith('/*')) return [`${pattern.slice(0, -2)}/(.*)`];
  if (pattern.endsWith('/')) return [pattern, `${pattern}index.html`];
  return [pattern];
}

/** `vercel.json` for the export, from the text of its `_headers`. */
export function renderVercelConfig(headersText) {
  const headers = parseHeaders(headersText).flatMap(({ pattern, headers: pairs }) =>
    vercelSources(pattern).map((source) => ({
      source,
      headers: pairs.map(([key, value]) => ({ key, value })),
    })),
  );
  return `${JSON.stringify({ trailingSlash: true, headers }, null, 2)}\n`;
}
