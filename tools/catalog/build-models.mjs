// Builds RoomForge's own catalog models (ADR-0007) from the code in models.mjs: the optimised GLB
// files and their thumbnails (P4-03), the catalog manifest that describes them and
// docs/ATTRIBUTION.md. Nothing in the output is edited by hand. Usage, from the repository root
// (see tools/catalog/README.md):
//   node tools/catalog/build-models.mjs                writes the files (pnpm catalog:build)
//   node tools/catalog/build-models.mjs --thumbnails   also renders every thumbnail again
//   node tools/catalog/build-models.mjs --check        writes nothing; fails if anything differs
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderAttribution } from './attribution.mjs';
import { budgetReport, hasContentHash, hashedName, quantizeGeometry } from './optimize.mjs';
import { renderThumbnails } from './thumbnails.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
export const MODELS_DIR = resolve(root, 'apps/web/public/assets');
export const MANIFEST_FILE = resolve(root, 'apps/web/src/asset-library/manifest/catalog.json');
export const ATTRIBUTION_FILE = resolve(root, 'docs/ATTRIBUTION.md');
/** The folders the build owns: any file in them the manifest does not name is removed. */
const OUTPUT_FOLDERS = { models: '.glb', thumbnails: '.webp' };
const BUDGET = { triangles: 20_000, bytes: 300_000 };

/**
 * Generator variant → catalog item. Ids follow DOMAIN_MODEL (`family.style.size`) and the item list
 * of docs/research/ASSET_SPIKE_P4_01.md; they are stable and never reused. Then the English and
 * Spanish names: they say what the object is (the generator's names only tell variants apart).
 */
const CATALOG = {
  'desk-office': ['desk.office.140', 'Office desk 140', 'Escritorio de oficina 140'],
  'desk-gaming': ['desk.gaming.160', 'Gaming desk 160', 'Escritorio gaming 160'],
  'desk-studio': ['desk.studio.160', 'Studio desk 160', 'Escritorio de estudio 160'],
  'chair-racing': ['chair.gaming.racing', 'Racing gaming chair', 'Silla gaming deportiva'],
  'chair-mesh': ['chair.gaming.ergonomic', 'Ergonomic gaming chair', 'Silla gaming ergonómica'],
  'chair-executive': ['chair.gaming.padded', 'Padded gaming chair', 'Silla gaming acolchada'],
  'monitor-flat': ['monitor.27.flat', 'Flat monitor 27 inch', 'Monitor plano 27 pulgadas'],
  'monitor-wide': [
    'monitor.ultrawide.34.curved',
    'Curved monitor 34 inch',
    'Monitor curvo 34 pulgadas',
  ],
  'monitor-arm': ['monitor.27.arm', 'Monitor on arm 27 inch', 'Monitor con brazo 27 pulgadas'],
  'led-strip': ['led.strip.1m', 'LED strip 1 m', 'Tira LED 1 m'],
  'light-bars': ['light.bars.pair', 'Light bar pair', 'Par de barras de luz'],
  'hex-panels': ['panel.hex.cluster', 'Hexagon light panels', 'Paneles de luz hexagonales'],
  'lamp-floor': ['lamp.floor.cone', 'Cone floor lamp', 'Lámpara de pie cónica'],
  'lamp-desk': ['lamp.desk.arm', 'Articulated desk lamp', 'Flexo articulado'],
  'neon-wave': ['neon.sign.wave', 'Neon wave sign', 'Letrero de neón en onda'],
};
const CATEGORY = { desk: 'desk', chair: 'seating', monitor: 'computing' };

/**
 * Luminaires (P4-10): the kind of light and its weight in the light budget (ADR-0006, P2-11); the
 * default colour is the one of the model's glowing slot. Then where they may go, the default first.
 */
const LIGHTS = {
  'led-strip': ['strip', 2, ['floor', 'wall', 'tabletop']],
  'light-bars': ['bar', 1, ['floor', 'tabletop']],
  'hex-panels': ['panel', 2, ['floor', 'wall']],
  'lamp-floor': ['point', 1, ['floor']],
  'lamp-desk': ['spot', 1, ['floor', 'tabletop']],
  'neon-wave': ['neon', 1, ['floor', 'wall']],
};

/** Where the other items may go (P3-13): monitors stand on the floor or on a desk. */
const SURFACES = { monitor: ['floor', 'tabletop'] };

/**
 * What `tabletop` items stand on (P3-13): a desk's whole top, at its height. The generator makes
 * the top a `w × d` board whose upper face is the top of the item's box.
 */
const supportsOf = (family, [w, h, d]) =>
  family === 'desk' ? [{ y: h, rect: { x: 0, z: 0, w, d } }] : undefined;

/** Open surfaces seen from both sides: their faces are doubled, since app materials are one-sided. */
const DOUBLE_SIDED = { 'monitor-wide': ['body'], 'lamp-floor': ['shade'], 'lamp-desk': ['shade'] };

const LICENSE = {
  spdx: 'LicenseRef-RoomForge-Proprietary',
  author: 'RoomForge',
  origin: 'Geometría procedural original (tools/catalog/models.mjs); sin assets de terceros',
  attribution: 'Modelo original de RoomForge. Todos los derechos reservados.',
};

/** Loads models.mjs with the three.js the web app already depends on (no new dependency). */
export async function loadGenerator() {
  const requireWeb = createRequire(resolve(root, 'apps/web/package.json'));
  const threeRoot = resolve(dirname(requireWeb.resolve('three')), '..');
  const url = (path) => JSON.stringify(pathToFileURL(resolve(threeRoot, path)).href);
  const source = (await readFile(resolve(here, 'models.mjs'), 'utf8'))
    .replaceAll("'three'", url('build/three.module.js'))
    .replace(/'three\/addons\/([^']+)'/g, (_, path) => url(`examples/jsm/${path}`));
  const generator = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
  const THREE = await import(pathToFileURL(resolve(threeRoot, 'build/three.module.js')).href);
  const addon = (path) => import(pathToFileURL(resolve(threeRoot, 'examples/jsm', path)).href);
  const { GLTFExporter } = await addon('exporters/GLTFExporter.js');
  const { GLTFLoader } = await addon('loaders/GLTFLoader.js');
  return { generator, THREE, GLTFExporter, GLTFLoader };
}

/** Same triangles seen from behind: reversed winding, flipped normals. */
function withBackFaces(THREE, geometry) {
  const back = geometry.clone();
  const index = back.index.array;
  for (let i = 0; i < index.length; i += 3)
    [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  const normal = back.attributes.normal;
  for (let i = 0; i < normal.array.length; i += 1) normal.array[i] = -normal.array[i];
  const offset = geometry.attributes.position.count;
  const merged = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    const a = geometry.attributes[name];
    const b = back.attributes[name];
    const array = new a.array.constructor(a.array.length + b.array.length);
    array.set(a.array);
    array.set(b.array, a.array.length);
    merged.setAttribute(name, new THREE.BufferAttribute(array, a.itemSize, a.normalized));
  }
  merged.setIndex([...geometry.index.array, ...[...index].map((v) => v + offset)]);
  back.dispose();
  return merged;
}

const round = (value) => Math.round(value * 1000) / 1000;

/** Exports a model as a binary glTF (GLB). */
async function exportGlb(GLTFExporter, model) {
  return Buffer.from(await new GLTFExporter().parseAsync(model, { binary: true }));
}

/**
 * Builds every model. `previous` is the committed manifest: a thumbnail whose model file did not
 * change is kept. `render` draws the others (`null` when checking: nothing is drawn then, and
 * their ids are returned in `staleThumbnails`); `rerender` draws every thumbnail again.
 */
export async function buildModels({
  previous = { items: [] },
  render = null,
  rerender = false,
} = {}) {
  const { generator, THREE, GLTFExporter } = await loadGenerator();
  globalThis.FileReader ??= class {
    async readAsArrayBuffer(blob) {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    }
  };
  const before = new Map(previous.items.map((item) => [item.id, item]));
  const files = new Map();
  const items = [];
  const report = [];
  const toRender = [];
  for (const variant of generator.variants) {
    const row = CATALOG[variant.id];
    if (!row) throw new Error(`${variant.id}: no catalog id`);
    const [id, en, es] = row;
    // Tags are the words of the id: desk.office.140 → desk, office.
    const tags = id.split('.').filter((part) => !/^\d+[a-z]?$/.test(part));
    const light = LIGHTS[variant.id];
    if (light && !tags.includes('light')) tags.push('light');
    const category = light ? 'lighting' : CATEGORY[variant.family];
    const meta = { id, name: { en, es }, category, tags };
    const model = generator.createModel(variant.id);
    for (const mesh of model.children) {
      // The generator faces -Z; the editor and glTF put an item's front towards +Z.
      let geometry = mesh.geometry.clone().rotateY(Math.PI);
      if (DOUBLE_SIDED[variant.id]?.includes(mesh.name)) geometry = withBackFaces(THREE, geometry);
      mesh.geometry = geometry;
    }
    const [w, h, d] = variant.size;
    const bounds = new THREE.Box3().setFromObject(model);
    const tolerance = 0.002;
    if (
      bounds.min.y < -tolerance ||
      bounds.max.y > h + tolerance ||
      Math.max(-bounds.min.x, bounds.max.x) > w / 2 + tolerance ||
      Math.max(-bounds.min.z, bounds.max.z) > d / 2 + tolerance
    ) {
      throw new Error(`${meta.id}: geometry outside its declared box ${variant.size}`);
    }
    const triangles = model.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
    const unoptimized = await exportGlb(GLTFExporter, model);
    // The generator already welds (mergeVertices) and the exporter writes only what the scene
    // holds, one material per slot: nothing is left to dedupe or prune. Quantisation is the step.
    for (const mesh of model.children) {
      const { offset, scale } = quantizeGeometry(THREE, mesh.geometry);
      mesh.position.fromArray(offset);
      mesh.scale.setScalar(scale);
    }
    const bytes = await exportGlb(GLTFExporter, model);
    const file = `models/${hashedName(meta.id, bytes, 'glb')}`;
    files.set(file, bytes);
    const materials = new Map(model.children.map((mesh) => [mesh.name, mesh.material]));
    const slots = generator.slots[variant.family].map((slot) => {
      const material = materials.get(slot.id);
      return {
        id: slot.id,
        label: { en: slot.label.en, es: slot.label.es },
        default: {
          presetId: 'paint.satin',
          tint: slot.color,
          roughness: round(material.roughness),
          metalness: round(material.metalness),
        },
        ...(slot.emissive ? { emissive: true } : {}),
      };
    });
    const old = before.get(meta.id);
    const keep = !rerender && old?.source.file === file && old.thumbnail;
    if (!keep) toRender.push({ id: meta.id, bytes, slots });
    items.push({
      id: meta.id,
      name: meta.name,
      category: meta.category,
      tags: meta.tags,
      size: { w, h, d },
      placement: { surfaces: light?.[2] ?? SURFACES[variant.family] ?? ['floor'] },
      ...(supportsOf(variant.family, variant.size) && {
        supports: supportsOf(variant.family, variant.size),
      }),
      slots,
      ...(light && {
        light: {
          kind: light[0],
          cost: light[1],
          defaultColor: generator.slots[variant.family].find((slot) => slot.emissive).color,
        },
      }),
      source: { kind: 'glb', file, triangles, bytes: bytes.length },
      ...(keep ? { thumbnail: old.thumbnail } : {}),
      license: LICENSE,
    });
    report.push({
      id: meta.id,
      triangles,
      materials: materials.size,
      textureBytes: 0,
      before: unoptimized.length,
      after: bytes.length,
    });
    for (const mesh of model.children) mesh.geometry.dispose();
    generator.disposeModelMaterials(model);
  }
  generator.disposeGeometryCache();
  const thumbnails = render && toRender.length > 0 ? await render(toRender) : new Map();
  const withThumbnails = items.map((item) => {
    const webp = thumbnails.get(item.id);
    if (!webp) return item;
    const thumbnail = `thumbnails/${hashedName(item.id, webp, 'webp')}`;
    files.set(thumbnail, webp);
    // Same key order as a kept thumbnail: after the model, before the licence.
    const { license, ...rest } = item;
    return { ...rest, thumbnail, license };
  });
  const manifest = { version: 1, items: withThumbnails };
  return {
    files,
    manifest: `${JSON.stringify(manifest, null, 2)}\n`,
    attribution: renderAttribution(manifest),
    report: budgetReport(report, BUDGET),
    staleThumbnails: toRender.filter((model) => !thumbnails.has(model.id)).map((model) => model.id),
  };
}

async function readOrNull(path) {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/** JSON is compared by value: Biome formats the committed manifest its own way. */
const same = (path, current, built) =>
  path.endsWith('.json')
    ? JSON.stringify(JSON.parse(current.toString('utf8'))) === JSON.stringify(JSON.parse(built))
    : current.equals(built);

/** The files of the build's own folders that the manifest does not name. */
async function strayFiles(manifest) {
  const named = new Set(manifest.items.flatMap((item) => [item.source.file, item.thumbnail]));
  const stray = [];
  for (const [folder, extension] of Object.entries(OUTPUT_FOLDERS)) {
    const entries = await readdir(resolve(MODELS_DIR, folder)).catch(() => []);
    for (const name of entries) {
      if (name.endsWith(extension) && !named.has(`${folder}/${name}`)) {
        stray.push(resolve(MODELS_DIR, folder, name));
      }
    }
  }
  return stray;
}

/** Thumbnails the manifest names that are missing or do not carry their content hash. */
async function badThumbnails(manifest) {
  const bad = [];
  for (const { thumbnail } of manifest.items) {
    if (!thumbnail) continue;
    const bytes = await readOrNull(resolve(MODELS_DIR, thumbnail));
    if (!bytes || !hasContentHash(thumbnail, bytes)) bad.push(resolve(MODELS_DIR, thumbnail));
  }
  return bad;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const committed = await readOrNull(MANIFEST_FILE);
  const built = await buildModels({
    previous: committed ? JSON.parse(committed.toString('utf8')) : undefined,
    render: check ? null : (models) => renderThumbnails(resolve(root, 'apps/web'), models),
    rerender: process.argv.includes('--thumbnails'),
  });
  const manifest = JSON.parse(built.manifest);
  const outputs = [
    ...[...built.files].map(([file, bytes]) => [resolve(MODELS_DIR, file), bytes]),
    [MANIFEST_FILE, Buffer.from(built.manifest)],
    [ATTRIBUTION_FILE, Buffer.from(built.attribution)],
  ];
  const stale = built.staleThumbnails.map((id) => `thumbnail of ${id}`);
  for (const [path, bytes] of outputs) {
    if (!check) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    } else {
      const current = await readOrNull(path);
      if (!current || !same(path, current, bytes)) stale.push(path);
    }
  }
  for (const path of await strayFiles(manifest)) {
    if (check) stale.push(`${path} (not in the manifest)`);
    else await rm(path);
  }
  stale.push(...(await badThumbnails(manifest)));
  if (!check) {
    const biome = resolve(root, 'node_modules/@biomejs/biome/bin/biome');
    execFileSync(process.execPath, [biome, 'format', '--write', MANIFEST_FILE], {
      stdio: 'ignore',
    });
    console.log(built.report);
  }
  if (stale.length > 0) {
    console.error(`Out of date (run pnpm catalog:build):\n${stale.join('\n')}`);
    process.exit(1);
  }
  console.log(
    `${check ? 'Checked' : 'Wrote'} ${manifest.items.length} models, their thumbnails, the manifest and ATTRIBUTION.md`,
  );
}
