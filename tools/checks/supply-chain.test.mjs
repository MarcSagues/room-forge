// Tests for the supply-chain checks (tools/checks/supply-chain.mjs).
// Run with: pnpm test:arch   (node --test, no extra dependencies)
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  findInstallScripts,
  flatten,
  installScriptProblems,
  isAllowed,
  licenseProblems,
  renderReport,
} from './supply-chain.mjs';

const allowed = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause']);

test('isAllowed accepts ids in the list and refuses the rest', () => {
  assert.equal(isAllowed('MIT', allowed), true);
  assert.equal(isAllowed('GPL-3.0-only', allowed), false);
  assert.equal(isAllowed('AGPL-3.0-or-later', allowed), false);
  assert.equal(isAllowed('', allowed), false);
  assert.equal(isAllowed('Some Custom License', allowed), false);
});

test('OR needs one allowed side, AND needs both', () => {
  assert.equal(isAllowed('MIT OR GPL-3.0-only', allowed), true);
  assert.equal(isAllowed('GPL-3.0-only OR MIT', allowed), true);
  assert.equal(isAllowed('GPL-3.0-only OR LGPL-3.0-only', allowed), false);
  assert.equal(isAllowed('MIT AND ISC', allowed), true);
  assert.equal(isAllowed('Apache-2.0 AND LGPL-3.0-or-later', allowed), false);
});

test('parentheses group, and AND binds tighter than OR', () => {
  assert.equal(isAllowed('(MIT OR GPL-3.0-only) AND ISC', allowed), true);
  assert.equal(isAllowed('(GPL-3.0-only OR LGPL-3.0-only) AND ISC', allowed), false);
  assert.equal(isAllowed('GPL-3.0-only AND MIT OR ISC', allowed), true);
  assert.equal(isAllowed('GPL-3.0-only AND (MIT OR ISC)', allowed), false);
});

test('an "or later" plus sign does not make a license different', () => {
  assert.equal(isAllowed('Apache-2.0+', allowed), true);
});

test('a malformed expression is not allowed', () => {
  assert.equal(isAllowed('MIT OR', allowed), false);
  assert.equal(isAllowed('MIT ISC', allowed), false);
  assert.equal(isAllowed('(MIT', allowed), true, 'an unclosed group still reads the id inside');
  assert.equal(isAllowed(')', allowed), false);
});

const policy = {
  allowedLicenses: [...allowed],
  licenseExceptions: {
    'font-pkg': 'a font, bundled legitimately',
    '@img/sharp-*': 'never shipped',
  },
  allowedInstallScripts: {
    'native-thing': 'reviewed: downloads a prebuilt binary from its own release',
  },
};

test('flatten turns pnpm’s grouping into rows, sorted by version', () => {
  const rows = flatten({
    MIT: [{ name: 'a', versions: ['2.0.0', '1.0.0'], paths: ['/x'] }],
    ISC: [{ name: 'b', versions: ['1.0.0'] }],
  });
  assert.deepEqual(rows, [
    { name: 'a', versions: ['1.0.0', '2.0.0'], license: 'MIT' },
    { name: 'b', versions: ['1.0.0'], license: 'ISC' },
  ]);
});

test('a license outside the list fails unless it has a written reason', () => {
  const rows = [
    { name: 'ok', versions: ['1.0.0'], license: 'MIT' },
    { name: 'font-pkg', versions: ['1.0.0'], license: 'OFL-1.1' },
    { name: '@img/sharp-linux', versions: ['0.1.0'], license: 'Apache-2.0 AND LGPL-3.0-or-later' },
    { name: 'copyleft', versions: ['3.0.0'], license: 'GPL-3.0-only' },
  ];
  const { unapproved, staleExceptions } = licenseProblems(rows, policy);
  assert.deepEqual(
    unapproved.map((row) => row.name),
    ['copyleft'],
  );
  assert.deepEqual(staleExceptions, []);
});

test('an exception nobody needs any more is reported, so the list does not rot', () => {
  const rows = [{ name: 'ok', versions: ['1.0.0'], license: 'MIT' }];
  const { unapproved, staleExceptions } = licenseProblems(rows, policy);
  assert.deepEqual(unapproved, []);
  assert.deepEqual(staleExceptions.sort(), ['@img/sharp-*', 'font-pkg']);
});

test('an exception for a package does not cover a different package of similar name', () => {
  const rows = [{ name: 'font-pkg-evil', versions: ['1.0.0'], license: 'GPL-3.0-only' }];
  assert.deepEqual(
    licenseProblems(rows, policy).unapproved.map((row) => row.name),
    ['font-pkg-evil'],
  );
});

function fixture(packages) {
  const directory = mkdtempSync(join(tmpdir(), 'rf-pnpm-'));
  for (const [folder, name, manifest] of packages) {
    const target = join(directory, folder, 'node_modules', ...name.split('/'));
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(target, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', ...manifest }),
    );
  }
  return directory;
}

test('findInstallScripts reports packages that declare an install hook', () => {
  const directory = fixture([
    ['safe@1.0.0', 'safe', { scripts: { build: 'tsc', test: 'vitest' } }],
    ['native-thing@1.0.0', 'native-thing', { scripts: { postinstall: 'node fetch.js' } }],
    ['@scope+tool@1.0.0', '@scope/tool', { scripts: { preinstall: 'x', install: 'y' } }],
  ]);
  try {
    const found = findInstallScripts(directory);
    assert.deepEqual(
      found.map((pkg) => [pkg.name, pkg.hooks]),
      [
        ['@scope/tool', ['preinstall', 'install']],
        ['native-thing', ['postinstall']],
      ],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('findInstallScripts counts a package once: the links to siblings are not packages of this folder', () => {
  const directory = fixture([
    ['app@1.0.0', 'app', {}],
    ['app@1.0.0', 'native-thing', { scripts: { postinstall: 'node x.js' } }],
    ['native-thing@1.0.0', 'native-thing', { scripts: { postinstall: 'node x.js' } }],
  ]);
  try {
    assert.equal(findInstallScripts(directory).length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('findInstallScripts of a folder that does not exist is nothing', () => {
  assert.deepEqual(findInstallScripts(join(tmpdir(), 'rf-does-not-exist')), []);
});

test('an install script passes only when approved by name, with a reason', () => {
  const found = [
    { name: 'native-thing', version: '1.0.0', hooks: ['postinstall'] },
    { name: 'sneaky', version: '9.9.9', hooks: ['preinstall'] },
  ];
  assert.deepEqual(
    installScriptProblems(found, policy).map((pkg) => pkg.name),
    ['sneaky'],
  );
  assert.deepEqual(installScriptProblems(found, { allowedInstallScripts: {} }).length, 2);
});

test('the report lists production dependencies and only counts the development ones', () => {
  const production = [{ name: 'react', versions: ['19.0.0'], license: 'MIT' }];
  const everything = [
    ...production,
    { name: 'vitest', versions: ['5.0.0'], license: 'MIT' },
    { name: 'font-pkg', versions: ['1.0.0'], license: 'OFL-1.1' },
  ];
  const report = renderReport(production, everything, policy);
  assert.match(report, /# Dependency licenses/);
  assert.match(report, /\| react \| 19\.0\.0 \| MIT \|/);
  assert.ok(!report.includes('| vitest |'), 'development packages are counted, not listed');
  assert.match(report, /`font-pkg`: a font, bundled legitimately/);
  assert.match(
    report,
    /Development dependencies only[\s\S]*\| MIT \| 1 \|[\s\S]*\| OFL-1\.1 \| 1 \|/,
  );
});
