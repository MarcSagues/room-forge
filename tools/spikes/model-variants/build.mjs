import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const requireWeb = createRequire(resolve(root, 'apps/web/package.json'));
const threeRoot = resolve(dirname(requireWeb.resolve('three')), '..');
const output = resolve(here, 'dist');
await mkdir(resolve(output, 'models'), { recursive: true });
await mkdir(resolve(output, 'vendor'), { recursive: true });

// Load the project's existing three dependency without adding one to the spike.
const source = await readFile(resolve(here, '../../catalog/models.mjs'), 'utf8');
const nodeSource = source
  .replaceAll(
    "'three'",
    JSON.stringify(pathToFileURL(resolve(threeRoot, 'build/three.module.js')).href),
  )
  .replace(/'three\/addons\/([^']+)'/g, (_, path) =>
    JSON.stringify(pathToFileURL(resolve(threeRoot, 'examples/jsm', path)).href),
  );
const { variants, slots, createModel, disposeModelMaterials, disposeGeometryCache } = await import(
  `data:text/javascript;base64,${Buffer.from(nodeSource).toString('base64')}`
);
const THREE = await import(pathToFileURL(resolve(threeRoot, 'build/three.module.js')).href);
const { GLTFExporter } = await import(
  pathToFileURL(resolve(threeRoot, 'examples/jsm/exporters/GLTFExporter.js')).href
);

globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
  async readAsDataURL(blob) {
    const bytes = Buffer.from(await blob.arrayBuffer());
    this.result = `data:${blob.type};base64,${bytes.toString('base64')}`;
    this.onloadend?.();
  }
};

const entries = [];
for (const variant of variants) {
  const started = performance.now();
  const model = createModel(variant.id);
  const generationMs = performance.now() - started;
  const bounds = new THREE.Box3().setFromObject(model);
  const actualSize = bounds.getSize(new THREE.Vector3()).toArray();
  if (actualSize.some((size, axis) => size > variant.size[axis] + 0.002) || bounds.min.y < -0.002) {
    throw new Error(`${variant.id}: geometry exceeds declared size: ${actualSize}`);
  }
  const triangles = model.children.reduce(
    (sum, mesh) =>
      sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3,
    0,
  );
  if (triangles > 20000) throw new Error(`${variant.id}: triangle budget exceeded (${triangles})`);
  const binary = await new GLTFExporter().parseAsync(model, { binary: true });
  const bytes = Buffer.from(binary);
  const file = `models/${variant.id}.glb`;
  await writeFile(resolve(output, file), bytes);
  entries.push({
    ...variant,
    file,
    triangles,
    bytes: bytes.length,
    textures: 0,
    materials: model.children.length,
    actualSize,
    generationMs: Number(generationMs.toFixed(2)),
    slots: slots[variant.family],
    license: {
      spdx: 'LicenseRef-RoomForge-Proprietary',
      author: 'RoomForge',
      origin: 'Original procedural geometry; no third-party assets',
    },
  });
  disposeModelMaterials(model);
}
disposeGeometryCache();
await writeFile(
  resolve(output, 'manifest.json'),
  `${JSON.stringify({ issue: 29, entries }, null, 2)}\n`,
);
await copyFile(resolve(here, '../../catalog/models.mjs'), resolve(output, 'models.js'));
await copyFile(resolve(here, 'preview.html'), resolve(output, 'index.html'));
for (const file of ['three.module.js', 'three.core.js'])
  await copyFile(resolve(threeRoot, 'build', file), resolve(output, 'vendor', file));
for (const [sourcePath, destination] of [
  ['controls/OrbitControls.js', 'OrbitControls.js'],
  ['geometries/RoundedBoxGeometry.js', 'RoundedBoxGeometry.js'],
  ['utils/BufferGeometryUtils.js', 'BufferGeometryUtils.js'],
  ['exporters/GLTFExporter.js', 'GLTFExporter.js'],
  ['loaders/GLTFLoader.js', 'loaders/GLTFLoader.js'],
  ['utils/BufferGeometryUtils.js', 'utils/BufferGeometryUtils.js'],
  ['utils/SkeletonUtils.js', 'utils/SkeletonUtils.js'],
]) {
  await mkdir(dirname(resolve(output, 'vendor', destination)), { recursive: true });
  await copyFile(
    resolve(threeRoot, 'examples/jsm', sourcePath),
    resolve(output, 'vendor', destination),
  );
}
await mkdir(resolve(output, 'cc0'), { recursive: true });
for (const filename of [
  'desk.glb',
  'chairDesk.glb',
  'computerScreen.glb',
  'LICENSE.txt',
  'source.json',
]) {
  await copyFile(resolve(here, 'assets-src/kenney', filename), resolve(output, 'cc0', filename));
}
await copyFile(resolve(threeRoot, 'LICENSE'), resolve(output, 'vendor/LICENSE-three.txt'));
console.log(
  JSON.stringify(
    {
      output,
      models: entries.length,
      triangles: entries.reduce((sum, entry) => sum + entry.triangles, 0),
      modelBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    },
    null,
    2,
  ),
);
