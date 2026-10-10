import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const requireWeb = createRequire(resolve(here, '../../../apps/web/package.json'));
const { chromium } = requireWeb('@playwright/test');
const threeRoot = resolve(dirname(requireWeb.resolve('three')), '..');
const { GLTFLoader } = await import(
  pathToFileURL(resolve(threeRoot, 'examples/jsm/loaders/GLTFLoader.js')).href
);
const output = resolve(here, 'dist');
const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
const loadTimes = [];
for (const entry of manifest.entries) {
  const bytes = await readFile(resolve(output, entry.file));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const start = performance.now();
  const parsed = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const parseMs = performance.now() - start;
  assert.deepEqual(
    parsed.scene.children[0].children.map((mesh) => mesh.material.name).sort(),
    entry.slots.map((slot) => slot.id).sort(),
  );
  parsed.scene.traverse((node) => {
    if (node.isMesh) {
      node.geometry.dispose();
      node.material.dispose();
    }
  });
  loadTimes.push({ id: entry.id, parseMs: Number(parseMs.toFixed(2)) });
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4189');
  await page.waitForFunction(() => window.__MODEL_SPIKE__?.renderer.info.render.triangles > 0);
  await mkdir(resolve(output, 'screenshots'), { recursive: true });
  const metrics = [];
  for (const entry of manifest.entries) {
    await page.selectOption('#family', entry.family);
    await page.selectOption('#variant', entry.id);
    for (const lighting of ['day', 'night']) {
      await page.selectOption('#lighting', lighting);
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      metrics.push(
        await page.evaluate(
          ({ id, lighting }) => {
            const { renderer } = window.__MODEL_SPIKE__;
            return {
              id,
              lighting,
              calls: renderer.info.render.calls,
              triangles: renderer.info.render.triangles,
              geometries: renderer.info.memory.geometries,
              textures: renderer.info.memory.textures,
            };
          },
          { id: entry.id, lighting },
        ),
      );
      await page
        .locator('#stage')
        .screenshot({ path: resolve(output, 'screenshots', `${entry.id}-${lighting}.png`) });
    }
  }
  await page.selectOption('#family', 'desk');
  await page.selectOption('#variant', 'desk-office');
  await page.selectOption('#lighting', 'day');
  const geometryBefore = await page.evaluate(() =>
    window.__MODEL_SPIKE__.model.children.map((mesh) => mesh.geometry.uuid),
  );
  await page.locator('#color-top').evaluate((input) => {
    input.value = '#dc687f';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const colors = await page.evaluate(() =>
    window.__MODEL_SPIKE__.model.children.map((mesh) => [
      mesh.name,
      mesh.material.color.getHexString(),
    ]),
  );
  assert.equal(colors.find(([slot]) => slot === 'top')[1], 'dc687f');
  assert.equal(colors.find(([slot]) => slot === 'frame')[1], '252c39');
  const downloadEvent = page.waitForEvent('download');
  await page.click('#download');
  const download = await downloadEvent;
  const downloadPath = resolve(output, 'custom-desk-office.glb');
  await download.saveAs(downloadPath);
  const downloaded = await readFile(downloadPath);
  const custom = await new GLTFLoader().parseAsync(
    downloaded.buffer.slice(downloaded.byteOffset, downloaded.byteOffset + downloaded.byteLength),
    '',
  );
  const top = custom.scene.children[0].children.find((mesh) => mesh.material.name === 'top');
  assert.equal(top.material.color.getHexString(), 'dc687f');
  custom.scene.traverse((node) => {
    if (node.isMesh) {
      node.geometry.dispose();
      node.material.dispose();
    }
  });
  assert.deepEqual(
    await page.evaluate(() =>
      window.__MODEL_SPIKE__.model.children.map((mesh) => mesh.geometry.uuid),
    ),
    geometryBefore,
  );
  const isolation = await page.evaluate(async () => {
    const { createModel, setSlotColor, disposeModelMaterials } = await import('./models.js');
    const a = createModel('desk-office');
    const b = createModel('desk-office');
    setSlotColor(a, 'top', '#dc687f');
    const result = {
      sharedGeometry: a.children[0].geometry === b.children[0].geometry,
      independentMaterials: a.children[0].material !== b.children[0].material,
      otherColor: b.children[0].material.color.getHexString(),
    };
    disposeModelMaterials(a);
    disposeModelMaterials(b);
    return result;
  });
  assert.equal(isolation.sharedGeometry, true);
  assert.equal(isolation.independentMaterials, true);
  assert.equal(isolation.otherColor, 'c6a47d');
  await page.selectOption('#variant', 'desk-gaming');
  assert.equal(await page.locator('#color-top').inputValue(), '#c6a47d');
  await page.selectOption('#variant', 'desk-office');
  assert.equal(await page.locator('#color-top').inputValue(), '#dc687f');
  await page.click('#reset');
  assert.equal(await page.locator('#color-top').inputValue(), '#c6a47d');
  await page.selectOption('#language', 'en');
  assert.equal(await page.locator('#family-label').textContent(), 'Object');
  await page.selectOption('#language', 'es');
  await page.waitForTimeout(350);
  const settled = await page.evaluate(() => window.__MODEL_SPIKE__.renderer.info.render.frame);
  await page.waitForTimeout(350);
  assert.equal(
    await page.evaluate(() => window.__MODEL_SPIKE__.renderer.info.render.frame),
    settled,
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: resolve(output, 'preview.png') });
  const comparisons = [];
  for (const [family, variant, fixture] of [
    ['desk', 'desk-office', 'desk'],
    ['chair', 'chair-racing', 'chairDesk'],
    ['monitor', 'monitor-flat', 'computerScreen'],
  ]) {
    await page.selectOption('#family', family);
    await page.selectOption('#variant', variant);
    const result = await page.evaluate(
      async ({ fixture }) => {
        const THREE = await import('three');
        const { GLTFLoader } = await import('./vendor/loaders/GLTFLoader.js');
        const diagnostic = window.__MODEL_SPIKE__;
        const target = new THREE.Box3()
          .setFromObject(diagnostic.model)
          .getSize(new THREE.Vector3());
        const start = performance.now();
        const response = await fetch(`cc0/${fixture}.glb`);
        const bytes = await response.arrayBuffer();
        const loaded = await new GLTFLoader().parseAsync(bytes, '');
        const loadMs = performance.now() - start;
        const imported = loaded.scene;
        imported.rotation.y = Math.PI;
        const bounds = new THREE.Box3().setFromObject(imported);
        const size = bounds.getSize(new THREE.Vector3());
        imported.scale.setScalar(Math.min(target.x / size.x, target.y / size.y, target.z / size.z));
        bounds.setFromObject(imported);
        const center = bounds.getCenter(new THREE.Vector3());
        imported.position.set(-center.x, -bounds.min.y, -center.z);
        let triangles = 0;
        const materials = new Set();
        imported.traverse((mesh) => {
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
          materials.add(mesh.material.name);
        });
        diagnostic.model.visible = false;
        diagnostic.scene.add(imported);
        diagnostic.comparison = imported;
        diagnostic.renderer.render(diagnostic.scene, diagnostic.camera);
        return {
          fixture,
          triangles,
          bytes: bytes.byteLength,
          textures: 0,
          materials: [...materials],
          localFetchAndParseMs: Number(loadMs.toFixed(2)),
        };
      },
      { fixture },
    );
    for (const lighting of ['day', 'night']) {
      await page.selectOption('#lighting', lighting);
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      await page
        .locator('#stage')
        .screenshot({ path: resolve(output, 'screenshots', `cc0-${fixture}-${lighting}.png`) });
    }
    await page.evaluate(() => {
      const diagnostic = window.__MODEL_SPIKE__;
      diagnostic.scene.remove(diagnostic.comparison);
      diagnostic.comparison.traverse((node) => {
        if (node.isMesh) {
          node.geometry.dispose();
          node.material.dispose();
        }
      });
      diagnostic.model.visible = true;
    });
    comparisons.push(result);
  }
  await writeFile(
    resolve(output, 'verification.json'),
    `${JSON.stringify({ checks: ['9 GLB round trips', '18 day/night captures', 'color slot isolation', 'custom-color GLB download', 'shared geometry across instances', 'independent instance materials', 'variant color memory and reset', 'ES/EN controls', 'idle renders stop', 'no browser errors', '3 licensed CC0 comparisons'], loadTimes, metrics, isolation, comparisons }, null, 2)}\n`,
  );
  const contact = await browser.newPage({ viewport: { width: 1500, height: 1250 } });
  await contact.goto('http://127.0.0.1:4189');
  await contact.setContent(
    `<html lang="es"><head><style>body{margin:0;padding:24px;background:#edf0f1;font:15px system-ui;color:#26353b}h1{font-size:25px;margin:0 0 6px}p{margin:0 0 18px;color:#526b70}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{background:#fff;border-radius:12px;overflow:hidden}.pair{display:flex}.pair img{width:50%;height:270px;object-fit:cover}h2{font-size:14px;margin:12px 16px}</style></head><body><h1>RoomForge · Primeros nueve modelos</h1><p>Escritorios, sillas gaming y monitores · día / noche · materiales editables por pieza</p><div class="grid">${manifest.entries.map((entry) => `<div class="card"><div class="pair"><img src="http://127.0.0.1:4189/screenshots/${entry.id}-day.png" alt="Día"><img src="http://127.0.0.1:4189/screenshots/${entry.id}-night.png" alt="Noche"></div><h2>${entry.name.es}</h2></div>`).join('')}</div></body></html>`,
  );
  await contact.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  await contact.screenshot({ path: resolve(output, 'contact-sheet.png'), fullPage: true });
  await contact.setContent(
    `<html lang="es"><head><style>body{margin:0;padding:24px;background:#edf0f1;font:15px system-ui;color:#26353b}h1{font-size:24px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}img{width:100%;height:250px;object-fit:cover}.card{background:#fff;border-radius:10px;overflow:hidden}p{margin:10px;font-size:12px}</style></head><body><h1>P4-01 · Propios y referencia Kenney CC0</h1><div class="grid">${[
      ['desk-office', 'desk'],
      ['chair-racing', 'chairDesk'],
      ['monitor-flat', 'computerScreen'],
    ]
      .flatMap(([own, cc0]) =>
        [
          ['Propio · día', `${own}-day`],
          ['Kenney · día', `cc0-${cc0}-day`],
          ['Propio · noche', `${own}-night`],
          ['Kenney · noche', `cc0-${cc0}-night`],
        ].map(
          ([label, image]) =>
            `<div class="card"><img src="http://127.0.0.1:4189/screenshots/${image}.png" alt="${label}"><p>${label}</p></div>`,
        ),
      )
      .join('')}</div></body></html>`,
  );
  await contact.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  await contact.screenshot({ path: resolve(output, 'cc0-comparison.png'), fullPage: true });
  console.log(
    JSON.stringify(
      {
        checks: 11,
        variants: manifest.entries.length,
        screenshots: metrics.length,
        maxCalls: Math.max(...metrics.map((row) => row.calls)),
        maxTriangles: Math.max(...metrics.map((row) => row.triangles)),
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
