// Guards the `sideEffects` declaration of apps/web (P7-04): it lets the bundler drop what a page
// does not use from the barrel files (`@/ui`, `@/persistence`…). Without it the landing page
// carried the whole projects screen, and zod with it: about 88 kB gzip more JavaScript.
// Run with: pnpm test:arch   (node --test, no extra dependencies)
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const web = join(root, 'apps/web');
const manifest = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8'));

const posix = (path) => path.split('\\').join('/');

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) ? [path] : [];
  });
}

test('apps/web declares which files have side effects, so unused exports can be dropped', () => {
  assert.ok(Array.isArray(manifest.sideEffects), 'sideEffects must be a list, not true or missing');
  assert.ok(manifest.sideEffects.includes('*.css'), 'stylesheets are imported for their effect');
});

test('every import done only for its effect is a stylesheet, or is listed in sideEffects', () => {
  const listed = manifest.sideEffects.filter((entry) => entry !== '*.css');
  const unlisted = [];
  for (const file of sources(join(web, 'src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/^import\s+['"]([^'"]+)['"];?\s*$/gm)) {
      const specifier = match[1];
      // A package decides for itself, in its own package.json; this file only governs apps/web.
      if (specifier.endsWith('.css') || !specifier.startsWith('.')) continue;
      const target = posix(relative(web, resolve(dirname(file), specifier)));
      if (!listed.some((entry) => target.includes(entry.replace(/^\.\//, '')))) {
        unlisted.push(`${posix(relative(root, file))} imports '${specifier}' for its effect`);
      }
    }
  }
  assert.deepEqual(
    unlisted,
    [],
    'a module imported only for its effect is dropped by the bundler unless apps/web/package.json lists it in "sideEffects"',
  );
});
