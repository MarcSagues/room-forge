#!/usr/bin/env node
/**
 * pre-push guard (docs/DEPLOYMENT.md §6, ADR-0009).
 *
 * GitHub cannot protect branches in this repository (private repo, free plan), so direct
 * pushes to `develop` and `main` are refused locally. Work goes through PRs from feature
 * branches. The owner can override with ROOMFORGE_ALLOW_PROTECTED_PUSH=1.
 *
 * git feeds one line per ref on stdin: "<local ref> <local sha> <remote ref> <remote sha>".
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PROTECTED_REFS = ['refs/heads/develop', 'refs/heads/main'];

export function findProtectedPushes(stdinText) {
  return stdinText
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 3 && PROTECTED_REFS.includes(parts[2]))
    .map(([localRef, , remoteRef]) => ({ localRef, remoteRef, isDelete: localRef === '(delete)' }));
}

function main() {
  if (process.env.ROOMFORGE_ALLOW_PROTECTED_PUSH === '1') return 0;
  let input = '';
  try {
    input = readFileSync(0, 'utf8');
  } catch {
    return 0; // no stdin (e.g. run by hand): nothing to check
  }
  const hits = findProtectedPushes(input);
  if (hits.length === 0) return 0;

  const targets = hits.map((h) => h.remoteRef.replace('refs/heads/', '')).join(', ');
  console.error(
    [
      `✖ Direct push to ${targets} is blocked.`,
      '  GitHub cannot protect branches in this repository (private repo, free plan),',
      '  so this hook enforces the rule locally: open a pull request from a feature branch.',
      '  See docs/DEPLOYMENT.md §6. Owner override: ROOMFORGE_ALLOW_PROTECTED_PUSH=1',
    ].join('\n'),
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
