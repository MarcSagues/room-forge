#!/usr/bin/env node
// What a built chunk is made of: attributes every byte of each chunk to the source file its
// source map points at, then groups by package (or by app folder). No dependencies.
//
// Usage (from the repo root):
//   BUNDLE_SOURCEMAPS=1 pnpm --filter @roomforge/web build:e2e
//   node tools/checks/bundle-breakdown.mjs [chunk names...] [--route=/editor/] [--files] [--top=N]
// With no chunk names, every chunk under apps/web/out/_next/static/chunks is read. `--route` reads
// the chunks the budgets spec measured for that route (run it on the same build first).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const CHUNKS = resolve(import.meta.dirname, '../../apps/web/out/_next/static/chunks');
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DIGIT = new Map([...B64].map((char, index) => [char, index]));

/** Decodes one VLQ segment of a source map into its numbers. */
export function decodeSegment(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = DIGIT.get(char);
    if (digit === undefined) throw new Error(`bad VLQ character ${char}`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    values.push(value & 1 ? -(value >>> 1) : value >>> 1);
    value = 0;
    shift = 0;
  }
  return values;
}

/** Normalised name of what a source belongs to: an npm package, or a folder of the app. */
export function groupOf(source) {
  const path = source.replace(/\\/g, '/');
  const modules = path.lastIndexOf('node_modules/');
  if (modules >= 0) {
    const rest = path.slice(modules + 'node_modules/'.length).split('/');
    return rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  }
  const app = path.match(/apps\/web\/src\/([^/]+)(?:\/([^/]+))?/);
  if (app) return app[2] && !app[2].includes('.') ? `web/${app[1]}/${app[2]}` : `web/${app[1]}`;
  const core = path.match(/packages\/core\/src\/([^/]+)/);
  if (core) return `core/${core[1].replace(/\.ts$/, '')}`;
  return path.replace(/^.*?\[project\]\//, '');
}

/** Bytes of generated code per source file, read from the chunk's mappings. */
export function bytesPerSource(code, map) {
  const lines = code.split('\n');
  const totals = new Map();
  const mappingLines = map.mappings.split(';');
  let source = 0;
  for (let line = 0; line < mappingLines.length && line < lines.length; line += 1) {
    const text = lines[line];
    let column = 0;
    let current = -1;
    let start = 0;
    const add = (end) => {
      if (current < 0 || end <= start) return;
      const name = map.sources[current] ?? '?';
      totals.set(name, (totals.get(name) ?? 0) + (end - start));
    };
    for (const segment of mappingLines[line].split(',')) {
      if (!segment) continue;
      const values = decodeSegment(segment);
      column += values[0];
      add(column);
      start = column;
      if (values.length >= 4) {
        source += values[1];
        current = source;
      } else {
        current = -1;
      }
      // Fields 2 and 3 (line, column in the source) and 4 (name) are relative too, but unused.
    }
    add(text.length);
  }
  return totals;
}

/** Reads a chunk and its map (inline sections are flattened into one list). */
function breakdown(file) {
  const code = readFileSync(join(CHUNKS, file), 'utf8');
  const linked = code.match(/\/\/# sourceMappingURL=(\S+)\s*$/)?.[1];
  const mapFile = join(CHUNKS, linked ?? `${file}.map`);
  if (!existsSync(mapFile)) return null;
  const map = JSON.parse(readFileSync(mapFile, 'utf8'));
  const totals = new Map();
  const sections = map.sections ?? [{ offset: { line: 0, column: 0 }, map }];
  const lines = code.split('\n');
  sections.forEach((section, index) => {
    const from = section.offset.line;
    const to = sections[index + 1]?.offset.line ?? lines.length;
    const part = lines.slice(from, to).join('\n');
    for (const [name, bytes] of bytesPerSource(part, section.map)) {
      totals.set(name, (totals.get(name) ?? 0) + bytes);
    }
  });
  return { raw: Buffer.byteLength(code), gzip: gzipSync(code).length, totals };
}

/** The chunks the budgets spec saw a route load (apps/web/budgets-report/budgets.json). */
function chunksOfRoute(route) {
  const report = resolve(import.meta.dirname, '../../apps/web/budgets-report/budgets.json');
  const measured = JSON.parse(readFileSync(report, 'utf8')).routes[route];
  if (!measured) throw new Error(`${route} is not in ${report}: run the budgets spec first`);
  return measured.chunks.map((chunk) => chunk.file).filter((file) => file.startsWith('chunks/'));
}

function main() {
  const args = process.argv.slice(2);
  const files = args.includes('--files');
  const top = Number(args.find((arg) => arg.startsWith('--top='))?.slice(6) ?? 40);
  const route = args.find((arg) => arg.startsWith('--route='))?.slice(8);
  const names = route ? chunksOfRoute(route) : args.filter((arg) => !arg.startsWith('--'));
  const chunks = names.length
    ? names.map((name) => (name.endsWith('.js') ? name : `${name}.js`))
    : readdirSync(CHUNKS).filter((name) => name.endsWith('.js'));
  for (const chunk of chunks) {
    const result = breakdown(chunk.replace(/^chunks\//, ''));
    if (!result) {
      console.log(`${chunk}: no source map (build with BUNDLE_SOURCEMAPS=1)`);
      continue;
    }
    const groups = new Map();
    for (const [source, bytes] of result.totals) {
      const key = files ? source.replace(/^.*?\[project\]\//, '') : groupOf(source);
      groups.set(key, (groups.get(key) ?? 0) + bytes);
    }
    const mapped = [...groups.values()].reduce((sum, bytes) => sum + bytes, 0);
    console.log(
      `\n## ${chunk}: ${(result.raw / 1024).toFixed(1)} kB raw, ${(result.gzip / 1024).toFixed(1)} kB gzip (${((100 * mapped) / result.raw).toFixed(0)}% mapped)`,
    );
    const rows = [...groups].sort((a, b) => b[1] - a[1]).slice(0, top);
    for (const [name, bytes] of rows) {
      const share = (100 * bytes) / result.raw;
      // Gzip estimated pro rata: good enough to rank contributors.
      console.log(
        `${(bytes / 1024).toFixed(1).padStart(8)} kB  ~${((share * result.gzip) / 100 / 1024).toFixed(1).padStart(6)} kB gz  ${name}`,
      );
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
