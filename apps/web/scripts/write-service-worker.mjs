// Writes `<export>/sw.js` for the static export: run after `next build` (see package.json).
// Usage: node scripts/write-service-worker.mjs [out-dir]
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestVersion, precacheUrls, serviceWorkerSource } from './sw-manifest.mjs';

const root = resolve(process.argv[2] ?? 'out');
const here = dirname(fileURLToPath(import.meta.url));

async function allFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await allFiles(path)));
    else files.push(relative(root, path).replaceAll('\\', '/'));
  }
  return files;
}

/** `/editor/` → `editor/index.html`, `/_next/static/x.js` → `_next/static/x.js`. */
const fileOf = (url) => (url.endsWith('/') ? `${url.slice(1)}index.html` : url.slice(1));

const urls = precacheUrls(await allFiles(root));
if (!urls.includes('/editor/')) throw new Error(`no editor page in ${root}: run next build first`);
const entries = await Promise.all(
  urls.map(async (url) => {
    const body = await readFile(join(root, fileOf(url)));
    return [url, createHash('sha256').update(body).digest('hex')];
  }),
);
const manifest = { version: manifestVersion(entries), urls };
const template = await readFile(join(here, 'service-worker.js'), 'utf8');
await writeFile(join(root, 'sw.js'), serviceWorkerSource(template, manifest));
console.log(`sw.js written: ${urls.length} files precached, version ${manifest.version}`);
