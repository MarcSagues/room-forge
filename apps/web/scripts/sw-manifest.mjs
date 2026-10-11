// The precache manifest of the service worker (P8-05). Pure functions, no dependencies:
// `write-service-worker.mjs` runs them after `next build`, tools/checks/sw-manifest.test.mjs tests them.
import { createHash } from 'node:crypto';
import { urlPathOf } from './headers.mjs';

/** Files at the root of the export the pages load themselves (theme script, icons, manifest). */
const ROOT_FILE = /^[^/]+\.(js|css|svg|ico|png|webp|webmanifest)$/;

/**
 * The URLs a visit needs to work offline: every page and every file under `/_next/static/` (the
 * chunks the editor loads later, such as the 3D canvas, are there too), plus the root files above.
 * Not the catalog models: those are cached as they are used, within a size cap.
 * @param {string[]} files paths relative to the export, with `/` or `\`
 */
export function precacheUrls(files) {
  const urls = new Set();
  for (const raw of files) {
    const file = raw.replaceAll('\\', '/');
    if (file.endsWith('.html')) {
      // Next writes the 404 page twice and an internal `_not-found` route: `/404.html` is enough.
      if (file.startsWith('_not-found/') || file.startsWith('404/')) continue;
      urls.add(urlPathOf(file));
    } else if (file.startsWith('_next/static/') && !file.endsWith('.map')) {
      urls.add(`/${file}`);
    } else if (ROOT_FILE.test(file) && file !== 'sw.js') {
      urls.add(`/${file}`);
    }
  }
  return [...urls].sort();
}

/**
 * A short name for one set of files: it changes when any precached file does, so a new build gets
 * a new cache (and a new worker), and an identical one keeps the old.
 * @param {Array<[string, string]>} entries URL → hash of its contents
 */
export function manifestVersion(entries) {
  const hash = createHash('sha256');
  for (const [url, digest] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(`${url}\0${digest}\n`);
  }
  return hash.digest('hex').slice(0, 16);
}

/** `sw.js`: the manifest first, then the worker. */
export function serviceWorkerSource(template, manifest) {
  return `self.__RF_PRECACHE__ = ${JSON.stringify(manifest)};\n${template}`;
}
