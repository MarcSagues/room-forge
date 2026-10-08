// Minimal static server for the `out/` export (E2E and local previews). No dependencies on purpose.
// Mirrors the production host: `trailingSlash: true`, so `/editor/` serves `/editor/index.html`.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'out');
const port = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
  '.webp': 'image/webp',
};

/**
 * Next 16 builds segment prefetch files as `__next.<a>.<b>.__PAGE__.txt`, but on Windows its export
 * joins the segment path with `\` instead of `/`, so the file lands at `__next.<a>/<b>/__PAGE__.txt`.
 * Linux builds (CI, hosting) are unaffected; this only keeps local Windows runs free of 404s.
 */
function windowsSegmentFallback(file) {
  const match = /^__next\.(.+)\.txt$/.exec(basename(file));
  if (!match) return [];
  const [first, ...rest] = match[1].split('.');
  return rest.length ? [`${join(dirname(file), `__next.${first}`, ...rest)}.txt`] : [];
}

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = normalize(join(root, decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null; // path traversal
  const files = [candidate, join(candidate, 'index.html'), `${candidate}.html`];
  for (const file of [...files, ...windowsSegmentFallback(candidate)]) {
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? '/').catch(() => null);
  const target = file ?? join(root, '404.html');
  res.writeHead(file ? 200 : 404, {
    'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
  });
  createReadStream(target)
    .on('error', () => res.end())
    .pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});
