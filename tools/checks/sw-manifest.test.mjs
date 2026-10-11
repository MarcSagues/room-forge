// Tests for the service worker's precache manifest (apps/web/scripts/sw-manifest.mjs, P8-05).
// Run with: pnpm test:arch   (node --test, no extra dependencies)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  manifestVersion,
  precacheUrls,
  serviceWorkerSource,
} from '../../apps/web/scripts/sw-manifest.mjs';

const EXPORT = [
  'index.html',
  'editor/index.html',
  'projects\\index.html',
  'view/index.html',
  '404.html',
  '404/index.html',
  '_not-found/index.html',
  '_next/static/chunks/app-1a2b.js',
  '_next/static/chunks/canvas-3c4d.js',
  '_next/static/chunks/app-1a2b.js.map',
  '_next/static/css/5e6f.css',
  '_next/static/media/inter.woff2',
  '_next/static/BUILD/_buildManifest.js',
  'theme-init.js',
  'icon.svg',
  'sw.js',
  '_headers',
  'index.txt',
  '__next._tree.txt',
  'editor/index.txt',
  'assets/models/chair.gaming.racing.glb',
];

test('the precache has every page and static file, and nothing the worker should not hold', () => {
  assert.deepEqual(precacheUrls(EXPORT), [
    '/',
    '/404.html',
    '/_next/static/BUILD/_buildManifest.js',
    '/_next/static/chunks/app-1a2b.js',
    '/_next/static/chunks/canvas-3c4d.js',
    '/_next/static/css/5e6f.css',
    '/_next/static/media/inter.woff2',
    '/editor/',
    '/icon.svg',
    '/projects/',
    '/theme-init.js',
    '/view/',
  ]);
});

test('models are not precached: they are cached when used, within a size cap', () => {
  assert.ok(!precacheUrls(EXPORT).some((url) => url.startsWith('/assets/')));
});

test('the version follows the contents, not the order the files came in', () => {
  const a = [
    ['/editor/', 'aaa'],
    ['/x.js', 'bbb'],
  ];
  assert.equal(manifestVersion(a), manifestVersion([...a].reverse()));
  assert.notEqual(
    manifestVersion(a),
    manifestVersion([
      ['/editor/', 'aaa'],
      ['/x.js', 'ccc'],
    ]),
  );
  assert.match(manifestVersion(a), /^[0-9a-f]{16}$/);
});

test('the worker script starts with its manifest, so a new build is a new worker', () => {
  const template = readFileSync(
    new URL('../../apps/web/scripts/service-worker.js', import.meta.url),
    'utf8',
  );
  const source = serviceWorkerSource(template, { version: 'v1', urls: ['/editor/'] });
  assert.ok(source.startsWith('self.__RF_PRECACHE__ = {"version":"v1","urls":["/editor/"]};\n'));
  assert.ok(source.endsWith(template));
  assert.notEqual(source, serviceWorkerSource(template, { version: 'v2', urls: ['/editor/'] }));
  assert.ok(template.includes("'SKIP_WAITING'"), 'the worker waits until the page asks it');
  assert.ok(!/\bskipWaiting\(\)/.test(template.replace(/.*SKIP_WAITING.*\n/g, '')));
});
