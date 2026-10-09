// Supply-chain checks (P7-09, ARCHITECTURE §11): no dependency may run an install script nobody
// reviewed, and every dependency's license must be usable in a commercial product.
//
//   node tools/checks/supply-chain.mjs                 check, exit 1 on a problem
//   node tools/checks/supply-chain.mjs --write-report  also rewrite docs/LICENSES.md
//
// The policy is tools/checks/supply-chain-policy.json. Pure functions are exported for the tests.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Licenses ────────────────────────────────────────────────────

/** Splits an SPDX expression into tokens: ids, AND, OR and parentheses. */
function tokenize(expression) {
  return expression.match(/\(|\)|[^\s()]+/g) ?? [];
}

/**
 * Whether an SPDX expression is allowed: `A OR B` when either side is, `A AND B` when both are,
 * a plain id when it is in the list. A `+` suffix ("or later") is ignored. Unknown text is not allowed.
 */
export function isAllowed(expression, allowed) {
  const tokens = tokenize(expression);
  let position = 0;
  const parseOr = () => {
    let value = parseAnd();
    while (tokens[position] === 'OR') {
      position += 1;
      const right = parseAnd();
      value = value || right;
    }
    return value;
  };
  const parseAnd = () => {
    let value = parseTerm();
    while (tokens[position] === 'AND') {
      position += 1;
      const right = parseTerm();
      value = value && right;
    }
    return value;
  };
  const parseTerm = () => {
    const token = tokens[position];
    position += 1;
    if (token === '(') {
      const value = parseOr();
      if (tokens[position] === ')') position += 1;
      return value;
    }
    return token !== undefined && allowed.has(token.replace(/\+$/, ''));
  };
  if (tokens.length === 0) return false;
  const result = parseOr();
  return position === tokens.length && result;
}

/** `{ "<license>": [{ name, versions }] }` (the output of `pnpm licenses list --json`) → rows. */
export function flatten(groups) {
  return Object.entries(groups).flatMap(([license, packages]) =>
    packages.map((pkg) => ({ name: pkg.name, versions: [...pkg.versions].sort(), license })),
  );
}

function exceptionFor(name, exceptions) {
  if (exceptions[name]) return exceptions[name];
  for (const [pattern, reason] of Object.entries(exceptions)) {
    if (pattern.endsWith('*') && name.startsWith(pattern.slice(0, -1))) return reason;
  }
  return undefined;
}

/**
 * The licenses the policy does not accept. A package whose license is not allowed passes only
 * with a written reason in `licenseExceptions`; reasons nobody needs any more are reported too.
 */
export function licenseProblems(rows, policy) {
  const allowed = new Set(policy.allowedLicenses);
  const exceptions = policy.licenseExceptions ?? {};
  const unapproved = [];
  const used = new Set();
  for (const row of rows) {
    if (isAllowed(row.license, allowed)) continue;
    const reason = exceptionFor(row.name, exceptions);
    if (reason) {
      for (const pattern of Object.keys(exceptions)) {
        if (
          pattern === row.name ||
          (pattern.endsWith('*') && row.name.startsWith(pattern.slice(0, -1)))
        ) {
          used.add(pattern);
        }
      }
    } else {
      unapproved.push(row);
    }
  }
  const staleExceptions = Object.keys(exceptions).filter((pattern) => !used.has(pattern));
  return { unapproved, staleExceptions };
}

// ── Install scripts ─────────────────────────────────────────────

const HOOKS = ['preinstall', 'install', 'postinstall'];

/**
 * Every installed package that declares an install hook (they run arbitrary code on `pnpm
 * install`). Reads `node_modules/.pnpm` of the repository: package folders are `<name>@<version>`.
 */
export function findInstallScripts(pnpmDirectory) {
  const found = [];
  if (!existsSync(pnpmDirectory)) return found;
  for (const folder of readdirSync(pnpmDirectory)) {
    const modules = join(pnpmDirectory, folder, 'node_modules');
    if (!existsSync(modules)) continue;
    for (const entry of readdirSync(modules)) {
      const candidates = entry.startsWith('@')
        ? readdirSync(join(modules, entry)).map((child) => join(modules, entry, child))
        : [join(modules, entry)];
      for (const directory of candidates) {
        const file = join(directory, 'package.json');
        if (!existsSync(file)) continue;
        let manifest;
        try {
          manifest = JSON.parse(readFileSync(file, 'utf8'));
        } catch {
          continue;
        }
        // Skip the links to other packages (pnpm symlinks siblings): only the package of this folder.
        if (!manifest.name || !folder.startsWith(`${manifest.name.replace('/', '+')}@`)) continue;
        const hooks = HOOKS.filter((hook) => manifest.scripts?.[hook]);
        if (hooks.length > 0) found.push({ name: manifest.name, version: manifest.version, hooks });
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** The install scripts the policy has not approved (by package name, with the reason written down). */
export function installScriptProblems(found, policy) {
  const approved = policy.allowedInstallScripts ?? {};
  return found.filter((pkg) => !approved[pkg.name]);
}

// ── Report ──────────────────────────────────────────────────────

/** The markdown report of docs/LICENSES.md: what is used, under which license, and why exceptions exist. */
export function renderReport(production, everything, policy) {
  const counts = (rows) => {
    const byLicense = new Map();
    for (const row of rows) byLicense.set(row.license, (byLicense.get(row.license) ?? 0) + 1);
    return [...byLicense].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const table = (rows) =>
    [
      '| License | Packages |',
      '|---|---|',
      ...counts(rows).map(([license, n]) => `| ${license} | ${n} |`),
    ].join('\n');
  const prodNames = new Set(production.map((row) => row.name));
  const devOnly = everything.filter((row) => !prodNames.has(row.name));
  const exceptions = Object.entries(policy.licenseExceptions ?? {})
    .map(([name, reason]) => `- \`${name}\`: ${reason}`)
    .join('\n');
  const list = [...production]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => `| ${row.name} | ${row.versions.join(', ')} | ${row.license} |`)
    .join('\n');
  return `# Dependency licenses

> Generated by \`pnpm licenses:report\` (tools/checks/supply-chain.mjs). Do not edit by hand.
> The policy is tools/checks/supply-chain-policy.json; \`pnpm check\` fails on a license it does not
> allow and on a dependency with an install script nobody approved.

Allowed without discussion: ${policy.allowedLicenses.join(', ')}. For an \`A OR B\` expression one allowed
side is enough; for \`A AND B\` both must be.

## Exceptions (reviewed)

${exceptions || 'None.'}

## Production dependencies (\`dependencies\` of the app and everything they pull in)

${table(production)}

| Package | Version | License |
|---|---|---|
${list}

## Development dependencies only (tests, linting and tooling)

${table(devOnly)}
`;
}

// ── Command line ────────────────────────────────────────────────

function listLicenses(production) {
  const args = ['licenses', 'list', '--json', ...(production ? ['--prod'] : [])];
  const output = execFileSync('pnpm', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  return flatten(JSON.parse(output));
}

function main() {
  const policy = JSON.parse(
    readFileSync(join(root, 'tools/checks/supply-chain-policy.json'), 'utf8'),
  );
  const everything = listLicenses(false);
  const production = listLicenses(true);
  let failed = false;

  const { unapproved, staleExceptions } = licenseProblems(everything, policy);
  for (const row of unapproved) {
    console.error(`license not allowed: ${row.name}@${row.versions.join(',')} is ${row.license}`);
    failed = true;
  }
  for (const pattern of staleExceptions) {
    console.error(`license exception no longer needed: ${pattern} (remove it from the policy)`);
    failed = true;
  }

  const scripts = installScriptProblems(
    findInstallScripts(join(root, 'node_modules', '.pnpm')),
    policy,
  );
  for (const pkg of scripts) {
    console.error(
      `install script not approved: ${pkg.name}@${pkg.version} runs ${pkg.hooks.join(', ')}`,
    );
    failed = true;
  }

  if (process.argv.includes('--write-report')) {
    writeFileSync(join(root, 'docs/LICENSES.md'), renderReport(production, everything, policy));
    console.log('docs/LICENSES.md written');
  }
  if (failed) process.exit(1);
  console.log(
    `supply chain ok: ${everything.length} packages, no unapproved license or install script`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
