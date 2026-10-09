// Writes `<export>/_headers` for the static export: run after `next build` (see package.json).
// Usage: node scripts/write-headers.mjs [out-dir]
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { renderHeaders } from './headers.mjs';

const root = resolve(process.argv[2] ?? 'out');

async function htmlFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith('.html')) files.push(path);
  }
  return files;
}

const pages = new Map();
for (const file of await htmlFiles(root)) {
  pages.set(relative(root, file), await readFile(file, 'utf8'));
}
if (pages.size === 0) throw new Error(`no HTML pages in ${root}: run next build first`);
await writeFile(join(root, '_headers'), renderHeaders(pages));
console.log(`_headers written for ${pages.size} pages in ${root}`);
