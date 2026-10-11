// Writes `<export>/vercel.json` from `<export>/_headers`: run after write-headers.mjs.
// Usage: node scripts/write-vercel-config.mjs [out-dir]
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { renderVercelConfig } from './vercel-config.mjs';

const root = resolve(process.argv[2] ?? 'out');
await writeFile(
  join(root, 'vercel.json'),
  renderVercelConfig(await readFile(join(root, '_headers'), 'utf8')),
);
console.log(`vercel.json written in ${root}`);
