// The breakdown attributes chunk bytes to sources: check the source map decoding it relies on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesPerSource, decodeSegment, groupOf } from './bundle-breakdown.mjs';

test('decodeSegment reads VLQ fields, signs and continuations', () => {
  assert.deepEqual(decodeSegment('AAAA'), [0, 0, 0, 0]);
  assert.deepEqual(decodeSegment('CACD'), [1, 0, 1, -1]);
  // 16 needs a continuation digit: 16 << 1 = 32 → 'gB'.
  assert.deepEqual(decodeSegment('gB'), [16]);
});

test('bytesPerSource splits a line between the sources its segments point at', () => {
  // Columns 0..4 come from source 0, 4..10 from source 1.
  const map = { sources: ['a.js', 'b.js'], mappings: 'AAAA,ICAA' };
  const totals = bytesPerSource('aaaabbbbbb', map);
  assert.equal(totals.get('a.js'), 4);
  assert.equal(totals.get('b.js'), 6);
});

test('groupOf names packages and app folders', () => {
  assert.equal(
    groupOf(
      'turbopack:///[project]/node_modules/.pnpm/three@0.186.1/node_modules/three/build/x.js',
    ),
    'three',
  );
  assert.equal(
    groupOf('turbopack:///[project]/node_modules/.pnpm/x/node_modules/@radix-ui/react-menu/a.mjs'),
    '@radix-ui/react-menu',
  );
  assert.equal(groupOf('turbopack:///[project]/apps/web/src/ui/shell/top-bar.tsx'), 'web/ui/shell');
  assert.equal(groupOf('turbopack:///[project]/apps/web/src/ui/index.ts'), 'web/ui');
  assert.equal(
    groupOf('turbopack:///[project]/packages/core/src/session/session.ts'),
    'core/session',
  );
});
