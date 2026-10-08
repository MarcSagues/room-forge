// Tests for the local git guards: pre-push branch protection and commit message lint.
// Run with: pnpm test:arch   (node --test, no extra dependencies)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findProtectedPushes } from './protect-branches.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha = 'a'.repeat(40);
const zero = '0'.repeat(40);
const line = (local, remote) => `${local} ${sha} ${remote} ${zero}\n`;

function runPrePush(stdin, env = {}) {
  return spawnSync(process.execPath, [path.join(root, 'tools/checks/protect-branches.mjs')], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, ROOMFORGE_ALLOW_PROTECTED_PUSH: '', ...env },
  });
}

test('findProtectedPushes flags develop and main only', () => {
  const hits = findProtectedPushes(
    line('refs/heads/x', 'refs/heads/develop') +
      line('refs/heads/y', 'refs/heads/main') +
      line('refs/heads/feat/1-a', 'refs/heads/feat/1-a') +
      line('refs/heads/develop-notes', 'refs/heads/develop-notes') +
      line('refs/tags/v1', 'refs/tags/v1'),
  );
  assert.deepEqual(
    hits.map((h) => h.remoteRef),
    ['refs/heads/develop', 'refs/heads/main'],
  );
});

test('pre-push blocks pushing to develop', () => {
  const r = runPrePush(line('refs/heads/develop', 'refs/heads/develop'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Direct push to develop is blocked/);
});

test('pre-push blocks deleting main', () => {
  const r = runPrePush(line('(delete)', 'refs/heads/main'));
  assert.equal(r.status, 1);
});

test('pre-push allows a feature branch', () => {
  const r = runPrePush(line('refs/heads/feat/13-x', 'refs/heads/feat/13-x'));
  assert.equal(r.status, 0);
});

test('pre-push honours the owner override', () => {
  const r = runPrePush(line('refs/heads/develop', 'refs/heads/develop'), {
    ROOMFORGE_ALLOW_PROTECTED_PUSH: '1',
  });
  assert.equal(r.status, 0);
});

function lint(message) {
  return spawnSync('pnpm', ['exec', 'commitlint'], {
    cwd: root,
    input: message,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
}

test('commitlint accepts a conventional commit with an allowed scope', () => {
  assert.equal(lint('feat(core): add undo history\n').status, 0);
});

test('commitlint accepts a commit without scope', () => {
  assert.equal(lint('docs: update the roadmap\n').status, 0);
});

test('commitlint rejects a non-conventional message', () => {
  assert.notEqual(lint('fixed stuff\n').status, 0);
});

test('commitlint rejects an unknown scope', () => {
  assert.notEqual(lint('feat(banana): add fruit\n').status, 0);
});

test('commitlint rejects a header longer than 72 characters', () => {
  assert.notEqual(lint(`feat(core): ${'x'.repeat(70)}\n`).status, 0);
});
