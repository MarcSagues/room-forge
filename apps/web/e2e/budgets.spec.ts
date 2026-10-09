import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import {
  type Budgets,
  type Chunk,
  type ChunkSummary,
  compare,
  describeFailures,
  gzipSize,
  kB,
  loadBudgets,
  renderReport,
  summarizeChunks,
} from '../../../tools/checks/budgets.mjs';

/**
 * Quality gates that need a real browser (P7-03): how much JavaScript each route loads, and what a
 * reference scene costs the GPU. The numbers are in quality-budgets.json; raising one needs a
 * reason in the PR. Serial, so that the report at the end sees every measurement.
 */
test.describe.configure({ mode: 'serial' });

const budgets: Budgets = loadBudgets();
const measured: { routes: Record<string, ChunkSummary>; scene?: Record<string, number> } = {
  routes: {},
};

/** Every script the page downloads until `ready` says it is up, with its size. */
async function javascriptLoaded(page: Page, route: string, ready: () => Promise<void>) {
  const pending: Promise<Chunk | null>[] = [];
  page.on('response', (response) => {
    if (!response.url().endsWith('.js')) return;
    pending.push(
      response
        .body()
        .then((body) => ({
          file: new URL(response.url()).pathname.replace('/_next/static/', ''),
          bytes: body.length,
          gzip: gzipSize(body),
          // three keeps its name in its error messages, which minification does not touch.
          three: body.includes('THREE.WebGLRenderer'),
        }))
        .catch(() => null),
    );
  });
  await page.goto(route);
  await ready();
  // Whatever the page still asks for right after it is up belongs to loading it too.
  await page.waitForTimeout(500);
  const chunks = (await Promise.all(pending)).filter((chunk): chunk is Chunk => chunk !== null);
  return summarizeChunks(chunks);
}

const ROUTES: Array<[string, (page: Page) => Promise<void>]> = [
  [
    '/',
    async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'RoomForge' })).toBeVisible();
    },
  ],
  [
    '/editor/',
    async (page) => {
      await page.waitForFunction(
        () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
      );
    },
  ],
];

for (const [route, ready] of ROUTES) {
  test(`${route} loads no more JavaScript than its budget`, async ({ page }) => {
    const summary = await javascriptLoaded(page, route, () => ready(page));
    measured.routes[route] = summary;
    expect(
      summary.chunks.length,
      'the page loaded no script at all: the check is not measuring',
    ).toBeGreaterThan(0);
    const rows = compare(
      { [route]: kB(summary.totalGzip) },
      { [route]: budgets.bundle.initialJsGzipKb[route] ?? Number.POSITIVE_INFINITY },
    );
    expect(describeFailures('bundle', rows)).toEqual([]);
  });
}

test('only the editor loads three.js', () => {
  const withThree = (route: string) =>
    (measured.routes[route]?.chunks ?? [])
      .filter((chunk) => chunk.three)
      .map((chunk) => chunk.file);
  // The landing page never needs the 3D engine (ADR-0002).
  expect(withThree('/')).toEqual([]);
  // ...and the editor does, so the marker is really finding it and this is not passing vacuously.
  expect(withThree('/editor/').length).toBeGreaterThan(0);
});

test('the pattern scene stays inside the scene budget', async ({ page }, testInfo) => {
  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
  const { objects } = budgets.scene.pattern;
  // A fixed grid inside the 4 x 4.5 m demo room, so the scene is the same on every run.
  await page.evaluate((count) => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    for (let i = 0; i < count; i += 1) {
      const result = hook.session.execute(
        hook.commands.addObject({
          id: `p${i}`,
          catalogId: 'test.box',
          roomId,
          position: [0.7 + (i % 6) * 0.52, 0, 0.7 + Math.floor(i / 6) * 0.7],
          rotationY: 0,
        }),
      );
      if (!result.ok) throw new Error(result.error.message);
    }
  }, objects);

  // Idle: the counters of the last frame are the cost of the scene.
  let previous = -1;
  for (let i = 0; i < 40; i += 1) {
    const now = await page.evaluate(() => window.__RF__?.info()?.frame ?? -1);
    if (now === previous) break;
    previous = now;
    await page.waitForTimeout(150);
  }
  const info = await page.evaluate(() => window.__RF__?.info());
  if (!info) throw new Error('no render info');
  expect(
    await page.evaluate(
      () => Object.keys(window.__RF__?.session.getState().document.objects ?? {}).length,
    ),
  ).toBe(objects);

  const scene = {
    calls: info.calls,
    triangles: info.triangles,
    programs: info.programs,
    geometries: info.geometries,
    textures: info.textures,
  };
  measured.scene = scene;
  await testInfo.attach('scene-counters.json', {
    body: JSON.stringify(scene, null, 2),
    contentType: 'application/json',
  });
  expect(info.calls, 'something was drawn').toBeGreaterThan(0);
  expect(describeFailures('scene', compare(scene, budgets.scene.limits))).toEqual([]);
});

test.afterAll(() => {
  if (Object.keys(measured.routes).length === 0) return;
  const report = renderReport(measured, budgets);
  mkdirSync('budgets-report', { recursive: true });
  writeFileSync('budgets-report/budgets.md', report);
  writeFileSync('budgets-report/budgets.json', JSON.stringify(measured, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
});
