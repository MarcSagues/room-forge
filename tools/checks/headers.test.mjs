// Tests for the security headers of the static export (apps/web/scripts/headers.mjs).
// Run with: pnpm test:arch   (node --test, no extra dependencies)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contentSecurityPolicy,
  headersFor,
  inlineScripts,
  parseHeaders,
  renderHeaders,
  SERVICE_WORKER_POLICY,
  scriptHash,
  urlPathOf,
} from '../../apps/web/scripts/headers.mjs';

const directives = (policy) =>
  Object.fromEntries(
    policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );

test('inlineScripts finds the scripts without a src, with their exact text', () => {
  const html =
    '<html><head><script src="/a.js"></script><script id="_R_" async>self.x=1</script></head>' +
    '<body><script>\n  hello();\n</script><script nonce="n">y()</script></body></html>';
  assert.deepEqual(inlineScripts(html), ['self.x=1', '\n  hello();\n', 'y()']);
});

test('inlineScripts skips data blocks, empty scripts and external ones', () => {
  const html =
    '<script type="application/json">{"a":1}</script><script type="application/ld+json">{}</script>' +
    '<script></script><script>   </script><script SRC=x.js></script><script type="module">m()</script>';
  assert.deepEqual(inlineScripts(html), ['m()']);
});

test('scriptHash matches the example of the CSP specification', () => {
  assert.equal(
    scriptHash("alert('Hello, world.');"),
    "'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='",
  );
});

test('the policy has no unsafe-eval and no unsafe-inline for scripts, only the page’s hashes', () => {
  const hashes = [scriptHash('a()'), scriptHash('b()')];
  const policy = directives(contentSecurityPolicy(hashes));
  assert.deepEqual(policy['script-src'], ["'self'", ...hashes]);
  const all = Object.values(policy).flat();
  assert.ok(!all.includes("'unsafe-eval'"));
  assert.ok(!all.includes("'wasm-unsafe-eval'"), 'nothing compiles WebAssembly yet');
  assert.ok(!policy['script-src'].includes("'unsafe-inline'"));
});

test('the policy shuts the doors that are not used', () => {
  const policy = directives(contentSecurityPolicy([]));
  assert.deepEqual(policy['default-src'], ["'self'"]);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.deepEqual(policy['frame-ancestors'], ["'none'"]);
  assert.deepEqual(policy['base-uri'], ["'self'"]);
  assert.deepEqual(policy['form-action'], ["'self'"]);
  assert.deepEqual(policy['connect-src'], ["'self'"]);
  assert.deepEqual(policy['img-src'], ["'self'", 'data:', 'blob:']);
  assert.deepEqual(policy['worker-src'], ["'self'", 'blob:']);
});

test('urlPathOf maps files to the URL they are served at', () => {
  assert.equal(urlPathOf('index.html'), '/');
  assert.equal(urlPathOf('editor/index.html'), '/editor/');
  assert.equal(urlPathOf('editor\\index.html'), '/editor/');
  assert.equal(urlPathOf('404.html'), '/404.html');
  assert.equal(urlPathOf('a/b/index.html'), '/a/b/');
});

const pages = new Map([
  ['index.html', '<script>one()</script><script>two()</script>'],
  ['editor/index.html', '<script>one()</script><script>three()</script>'],
  ['404.html', '<p>no scripts</p>'],
]);

test('every page gets its own policy, with its own hashes', () => {
  const rules = parseHeaders(renderHeaders(pages));
  const csp = (path) => headersFor(rules, path).get('content-security-policy');
  assert.ok(csp('/').includes(scriptHash('one()')) && csp('/').includes(scriptHash('two()')));
  assert.ok(csp('/editor/').includes(scriptHash('three()')));
  assert.ok(
    !csp('/editor/').includes(scriptHash('two()')),
    'a page does not get another page’s hashes',
  );
  assert.deepEqual(directives(csp('/404.html'))['script-src'], ["'self'"]);
});

test('the policy is set by exactly one rule per page: Cloudflare would join two into a stricter one', () => {
  const rules = parseHeaders(renderHeaders(pages));
  for (const path of ['/', '/editor/', '/404.html']) {
    const value = headersFor(rules, path).get('content-security-policy');
    assert.equal(value.match(/default-src/g).length, 1, `${path} has one policy`);
  }
  const catchAll = rules.find((rule) => rule.pattern === '/*');
  assert.ok(!catchAll.headers.some(([name]) => /content-security-policy/i.test(name)));
});

test('every page also gets the common headers, and assets get long caching', () => {
  const rules = parseHeaders(renderHeaders(pages));
  const page = headersFor(rules, '/editor/');
  assert.equal(page.get('x-content-type-options'), 'nosniff');
  assert.equal(page.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(page.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(
    headersFor(rules, '/_next/static/chunks/a.js').get('cache-control'),
    'public, max-age=31536000, immutable',
  );
  assert.equal(headersFor(rules, '/editor/').get('cache-control'), undefined);
});

test('the service worker is always revalidated and may only fetch from its own origin', () => {
  const rules = parseHeaders(renderHeaders(pages));
  const worker = headersFor(rules, '/sw.js');
  assert.equal(worker.get('cache-control'), 'no-cache');
  assert.equal(worker.get('content-security-policy'), SERVICE_WORKER_POLICY);
  assert.deepEqual(directives(SERVICE_WORKER_POLICY)['default-src'], ["'self'"]);
  assert.deepEqual(directives(SERVICE_WORKER_POLICY)['script-src'], ["'none'"]);
});

test('the file is the same for the same pages, whatever order they came in', () => {
  const reversed = new Map([...pages].reverse());
  assert.equal(renderHeaders(pages), renderHeaders(reversed));
});

test('equal scripts are hashed once, and a line stays under the host’s 2 000 character limit', () => {
  const html = `<script>same()</script><script>same()</script>${Array.from({ length: 12 }, (_, i) => `<script>s${i}()</script>`).join('')}`;
  const text = renderHeaders(new Map([['index.html', html]]));
  const policy = text.split('\n').find((line) => line.includes("script-src 'self'"));
  assert.equal(policy.split(scriptHash('same()')).length - 1, 1);
  assert.ok(policy.length < 2000, `the policy line has ${policy.length} characters`);
});

test('headersFor joins equal headers from several rules and escapes patterns', () => {
  const rules = parseHeaders('/*\n  X-A: 1\n/a.html\n  X-A: 2\n/*.html\n  X-B: yes\n');
  assert.equal(headersFor(rules, '/a.html').get('x-a'), '1, 2');
  assert.equal(headersFor(rules, '/a.html').get('x-b'), 'yes');
  assert.equal(
    headersFor(rules, '/aXhtml').get('x-b'),
    undefined,
    'the dot is a dot, not a wildcard',
  );
  assert.equal(headersFor(rules, '/other').get('x-a'), '1');
});

test('parseHeaders ignores comments and blank lines', () => {
  const rules = parseHeaders('# comment\n\n/x\n  A: b: c\n');
  assert.deepEqual(rules, [{ pattern: '/x', headers: [['A', 'b: c']] }]);
});
