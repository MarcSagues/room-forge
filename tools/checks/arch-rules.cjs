'use strict';
/**
 * Module-boundary rules (docs/ARCHITECTURE.md §2.1, ADR-0001, ADR-0008).
 *
 * `buildRules` takes the roots as parameters so the same rules can be tested against
 * fixtures (tools/checks/arch-rules.test.mjs) and applied to the real sources
 * (.dependency-cruiser.cjs).
 */

const WEB_MODULES = [
  'ui',
  'editor',
  'scene-engine',
  'asset-library',
  'persistence',
  'export',
  'ai',
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildRules({ web = 'apps/web/src', core = 'packages/core/src' } = {}) {
  const w = escapeRe(web);
  const c = escapeRe(core);
  const mods = WEB_MODULES.join('|');
  const lowerLayers = [
    'editor',
    'scene-engine',
    'asset-library',
    'persistence',
    'export',
    'ai',
  ].join('|');
  // Matches both an unresolved bare specifier ("react", "three/examples/...") and a resolved path.
  const pkg = (names) => `(^|node_modules/)(${names.join('|')})(/|$)`;
  // Test files, core's test support (builders, fast-check arbitraries) and the `testing/` folder a
  // web module may keep for helpers that only its tests import (a repository contract, say).
  const testSupport = `\\.(test|spec)\\.[jt]sx?$|^${c}/testing/|^${w}/[^/]+/testing/`;

  return [
    {
      name: 'core-is-pure',
      comment:
        'packages/core is pure TypeScript: no React, three.js, Next or IndexedDB (ADR-0001).',
      severity: 'error',
      from: { path: `^${c}/` },
      to: { path: pkg(['react', 'react-dom', 'three', 'next', 'idb', '@react-three']) },
    },
    {
      name: 'core-no-web',
      comment: 'packages/core must not depend on the web app.',
      severity: 'error',
      from: { path: `^${c}/` },
      to: { path: `^${w}/` },
    },
    {
      name: 'no-ui-from-lower-layers',
      comment:
        'Only app/ and ui/ may depend on ui/. Engine, assets, persistence, export and ai must not.',
      severity: 'error',
      from: { path: `^${w}/(${lowerLayers})/` },
      to: { path: `^${w}/ui/` },
    },
    {
      name: 'ui-no-persistence',
      comment: 'UI talks to persistence through the editor module, never directly.',
      severity: 'error',
      from: { path: `^${w}/ui/` },
      to: { path: `^${w}/persistence/` },
    },
    {
      name: 'persistence-no-three',
      comment: 'persistence is renderer-agnostic.',
      severity: 'error',
      from: { path: `^${w}/persistence/` },
      to: { path: pkg(['three', '@react-three']) },
    },
    {
      name: 'web-modules-via-index',
      comment:
        "Web modules talk to each other only through the target module's public index.ts (no deep imports).",
      severity: 'error',
      from: { path: `^${w}/(app|${mods})/` },
      to: {
        path: `^${w}/(${mods})/(?!index\\.tsx?$)`,
        pathNot: `^${w}/$1/`,
      },
    },
    {
      name: 'no-circular',
      comment: 'No circular dependencies.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'Every import must resolve (a missing dependency is a bug).',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'not-to-dev-dep',
      comment:
        'Production sources must not import devDependencies (core test support, e.g. fast-check arbitraries, may).',
      severity: 'error',
      from: { path: `^(${w}|${c})/`, pathNot: testSupport },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-test-support-in-production',
      comment: 'Only tests may import core test support (@roomforge/core/testing).',
      severity: 'error',
      from: { path: `^(${w}|${c})/`, pathNot: testSupport },
      to: { path: `^${c}/testing/` },
    },
  ];
}

module.exports = { buildRules, WEB_MODULES };
