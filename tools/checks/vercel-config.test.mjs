// Tests for the Vercel configuration derived from `_headers` (apps/web/scripts/vercel-config.mjs).
// Run with: pnpm test:arch   (node --test, no extra dependencies)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderVercelConfig, vercelSources } from '../../apps/web/scripts/vercel-config.mjs';

const HEADERS = `/*
  X-Content-Type-Options: nosniff

/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/editor/
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-abc='
`;

test('maps _headers patterns to Vercel sources', () => {
  assert.deepEqual(vercelSources('/*'), ['/(.*)']);
  assert.deepEqual(vercelSources('/_next/static/*'), ['/_next/static/(.*)']);
  assert.deepEqual(vercelSources('/editor/'), ['/editor/', '/editor/index.html']);
  assert.deepEqual(vercelSources('/'), ['/', '/index.html']);
  assert.deepEqual(vercelSources('/404.html'), ['/404.html']);
});

test('keeps every header of every rule, with trailing-slash URLs', () => {
  const config = JSON.parse(renderVercelConfig(HEADERS));
  assert.equal(config.trailingSlash, true);
  assert.deepEqual(
    config.headers.map((rule) => rule.source),
    ['/(.*)', '/_next/static/(.*)', '/editor/', '/editor/index.html'],
  );
  const editor = config.headers.find((rule) => rule.source === '/editor/');
  assert.deepEqual(editor.headers, [
    {
      key: 'Content-Security-Policy',
      value: "default-src 'self'; script-src 'self' 'sha256-abc='",
    },
  ]);
});
