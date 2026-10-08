// Tests for the module-boundary rules (tools/checks/arch-rules.cjs) against fixtures.
// Run with: pnpm test:arch   (node --test, no extra dependencies)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(root); // rules are matched against repo-relative paths

const { buildRules } = createRequire(import.meta.url)('./arch-rules.cjs');

async function violationsFor(fixture) {
  const base = `tools/checks/fixtures/arch/${fixture}`;
  const result = await cruise(
    [base],
    {
      validate: true,
      ruleSet: { forbidden: buildRules({ web: `${base}/web/src`, core: `${base}/core/src` }) },
      doNotFollow: { path: 'node_modules' },
      tsPreCompilationDeps: true,
    },
    {},
    {},
  );
  return result.output.summary.violations.map((v) => v.rule.name);
}

test('the allowed dependency graph has no violations', async () => {
  assert.deepEqual(await violationsFor('valid'), []);
});

const invalid = {
  'core-imports-react': 'core-is-pure',
  'core-imports-web': 'core-no-web',
  'scene-imports-ui': 'no-ui-from-lower-layers',
  'ui-imports-scene-internals': 'web-modules-via-index',
  'ui-imports-persistence': 'ui-no-persistence',
  'persistence-imports-three': 'persistence-no-three',
  circular: 'no-circular',
};

for (const [fixture, rule] of Object.entries(invalid)) {
  test(`${fixture} is rejected by "${rule}"`, async () => {
    const names = await violationsFor(fixture);
    assert.ok(names.includes(rule), `expected rule "${rule}" but got [${names.join(', ')}]`);
  });
}
