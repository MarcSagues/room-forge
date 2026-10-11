// Security headers of the static export (P7-09, DEPLOYMENT §7). Pure functions, no dependencies:
// `write-headers.mjs` runs them after `next build`, `serve-static.mjs` applies the result in E2E and
// tools/checks/headers.test.mjs tests them.
import { createHash } from 'node:crypto';

/**
 * The text of every inline script of a page, as the browser hashes it. Next's static export puts a
 * few of them in each page (the start of React's data stream); a hash lets exactly those run
 * without `'unsafe-inline'`. Scripts with a `src` and data blocks that are not JavaScript need none.
 */
export function inlineScripts(html) {
  const scripts = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1] ?? '';
    if (/\ssrc\s*=/i.test(` ${attributes}`)) continue;
    const type = /\stype\s*=\s*["']?([^\s"'>]+)/i.exec(` ${attributes}`)?.[1]?.toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    const text = match[2] ?? '';
    if (text.trim() !== '') scripts.push(text);
  }
  return scripts;
}

/** `'sha256-<base64>'`, the source expression for one inline script. */
export function scriptHash(text) {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/**
 * The Content-Security-Policy of a page. No `unsafe-eval` anywhere; no `unsafe-inline` for
 * scripts, only the hashes of that page's own. Inline styles stay allowed: React sets `style`
 * attributes and Next's error pages carry a `<style>`; that is a far smaller risk than scripts.
 * `wasm-unsafe-eval` is not here because nothing compiles WebAssembly yet: P4-04 adds it with Draco.
 */
export function contentSecurityPolicy(scriptHashes) {
  const scripts = ["'self'", ...scriptHashes].join(' ');
  return [
    "default-src 'self'",
    `script-src ${scripts}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

const LONG_CACHE = 'public, max-age=31536000, immutable';
/** Files whose names carry a hash of their content: Next's build and the catalog's (P4-03). */
const IMMUTABLE = ['/_next/static/*', '/assets/models/*', '/assets/thumbnails/*'];

/** `editor/index.html` → `/editor/`, `index.html` → `/`, `404.html` → `/404.html`. */
export function urlPathOf(file) {
  const normalized = file.replaceAll('\\', '/');
  if (normalized === 'index.html') return '/';
  if (normalized.endsWith('/index.html')) return `/${normalized.slice(0, -'index.html'.length)}`;
  return `/${normalized}`;
}

/**
 * The `_headers` file. Cloudflare joins the values of a header that several matching rules set, so
 * the Content-Security-Policy is set by exactly one rule per page (never in `/*`): two policies
 * would both be enforced and the stricter one would break the page.
 * @param {Map<string, string>} pages file path (relative to the export) → HTML
 */
export function renderHeaders(pages) {
  const blocks = [
    [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    ].join('\n'),
    ...IMMUTABLE.map((pattern) => `${pattern}\n  Cache-Control: ${LONG_CACHE}`),
  ];
  const sorted = [...pages].sort(([a], [b]) => a.localeCompare(b));
  for (const [file, html] of sorted) {
    const hashes = [...new Set(inlineScripts(html).map(scriptHash))].sort();
    blocks.push(
      [urlPathOf(file), `  Content-Security-Policy: ${contentSecurityPolicy(hashes)}`].join('\n'),
    );
  }
  return `${blocks.join('\n\n')}\n`;
}

/**
 * Reads a `_headers` file: rules with a path pattern (`*` matches anything) and their headers.
 * @returns {{ pattern: string, headers: [string, string][] }[]}
 */
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    const colon = line.indexOf(':');
    const rule = rules.at(-1);
    if (colon > 0 && rule)
      rule.headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return rules;
}

/** The headers a URL path gets: every matching rule applies, equal headers joined with ", ". */
export function headersFor(rules, urlPath) {
  const merged = new Map();
  for (const { pattern, headers } of rules) {
    const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
    if (!new RegExp(`^${source}$`).test(urlPath)) continue;
    for (const [name, value] of headers) {
      const key = name.toLowerCase();
      merged.set(key, merged.has(key) ? `${merged.get(key)}, ${value}` : value);
    }
  }
  return merged;
}
