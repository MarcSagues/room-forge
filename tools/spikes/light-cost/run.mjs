// Runs the light-cost bench in the project's Playwright Chromium and writes dist/results-*.json.
// Usage: node tools/spikes/light-cost/run.mjs [swiftshader|d3d11|gl ...]
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const requireWeb = createRequire(resolve(root, 'apps/web/package.json'));
const { chromium } = requireWeb('@playwright/test');
const port = 4197;
const origin = `http://127.0.0.1:${port}`;
const output = resolve(here, 'dist');

// SwiftShader renders on the CPU: valid for relative costs and recompiles, not for absolute FPS.
const backends = {
  swiftshader: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    size: [1280, 720],
    frames: 30,
    repeats: 1,
  },
  d3d11: {
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'],
    size: [1920, 1080],
    frames: 120,
    repeats: 3,
  },
  gl: {
    args: ['--use-angle=gl', '--ignore-gpu-blocklist'],
    size: [1920, 1080],
    frames: 120,
    repeats: 3,
  },
};
const requested = process.argv.slice(2);
const selected = requested.length ? requested : ['swiftshader', 'd3d11'];

const server = spawn(
  process.execPath,
  [resolve(root, 'apps/web/scripts/serve-static.mjs'), output],
  {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  },
);

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`server did not start on ${origin}`);
}

async function runPage(backend, query, timeout) {
  // A fresh browser per run so the GPU process starts with an empty shader cache.
  const browser = await chromium.launch({ headless: true, args: backend.args });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`${origin}/?${query}`);
    await page.waitForFunction(() => window.__LIGHT_SPIKE__?.state.done, null, { timeout });
    const state = await page.evaluate(() => window.__LIGHT_SPIKE__.state);
    return { ...state, errors };
  } finally {
    await browser.close();
  }
}

async function screenshots(backend, name) {
  const browser = await chromium.launch({ headless: true, args: backend.args });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
    await mkdir(resolve(output, 'screenshots'), { recursive: true });
    for (const view of ['point-8', 'spot-8', 'rect-8', 'point-0+strips', 'point-8+bloom']) {
      await page.goto(`${origin}/?view=${encodeURIComponent(view)}&w=1280&h=720`);
      await page.waitForFunction(() => window.__LIGHT_SPIKE__);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
      await page
        .locator('#stage canvas')
        .screenshot({ path: resolve(output, 'screenshots', `${name}-${view}.png`) });
    }
  } finally {
    await browser.close();
  }
}

function table(rows, columns) {
  const lines = [`| ${columns.join(' | ')} |`, `|${columns.map(() => '---').join('|')}|`];
  for (const row of rows) lines.push(`| ${columns.map((c) => row[c] ?? '—').join(' | ')} |`);
  return lines.join('\n');
}

try {
  await waitForServer();
  for (const name of selected) {
    const backend = backends[name];
    const [w, h] = backend.size;
    const timeout = 30 * 60 * 1000;
    const matrix = await runPage(
      backend,
      `auto=1&w=${w}&h=${h}&k=${backend.frames}&r=${backend.repeats}`,
      timeout,
    );
    const recompile = await runPage(backend, `auto=1&mode=recompile&w=${w}&h=${h}`, timeout);
    if (name !== 'swiftshader') await screenshots(backend, name);
    const result = {
      backend: name,
      gpu: matrix.gpu,
      timerQuery: matrix.timerQuery,
      size: `${w}x${h}`,
      frames: backend.frames,
      matrix: matrix.matrix,
      recompile: recompile.recompile,
      errors: [...matrix.errors, ...recompile.errors],
    };
    await writeFile(
      resolve(output, `results-${name}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(`\n## ${name} — ${result.gpu} — ${result.size}, ${result.frames} frames\n`);
    console.log(
      table(result.matrix, [
        'id',
        'programsAfter',
        'firstFrameMs',
        'wallMedianMs',
        'wallP95Ms',
        'gpuMedianMs',
        'gpuP95Ms',
        'fps',
        'calls',
        'triangles',
      ]),
    );
    console.log('');
    console.log(
      table(result.recompile, [
        'id',
        'programsBefore',
        'programsAfter',
        'firstFrameMs',
        'wallMedianMs',
        'gpuMedianMs',
      ]),
    );
    console.log(`\nerrors: ${JSON.stringify(result.errors)}`);
  }
} finally {
  server.kill();
}
