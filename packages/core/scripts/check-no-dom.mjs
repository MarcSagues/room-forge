#!/usr/bin/env node
// Guard for ADR-0001: packages/core must not compile code that touches the DOM.
//  1. The real sources compile.
//  2. A fixture that uses `window` and `document` is rejected by tsc.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

const run = (project) =>
  spawnSync(process.execPath, [tsc, '-p', project, '--pretty', 'false'], {
    cwd: root,
    encoding: 'utf8',
  });

const fail = (message, output = '') => {
  console.error(`✖ ${message}\n${output}`);
  process.exit(1);
};

const good = run('tsconfig.json');
if (good.status !== 0) fail('packages/core sources do not compile', good.stdout + good.stderr);

const bad = run('tsconfig.negative.json');
const out = bad.stdout + bad.stderr;
if (bad.status === 0)
  fail('DOM fixture compiled: packages/core must not have access to DOM types', out);

// TS2304 "Cannot find name 'window'" / TS2584 "Cannot find name 'document'. Do you need to change your target library?"
const mentions = (name) => new RegExp(`error TS(2304|2584): Cannot find name '${name}'`).test(out);
if (!mentions('window') || !mentions('document')) {
  fail('DOM fixture failed, but not for the expected reason (missing window/document errors)', out);
}

console.log('✔ core purity: sources compile; window/document are rejected (no DOM lib)');
