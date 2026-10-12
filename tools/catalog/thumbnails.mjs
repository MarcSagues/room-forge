// Catalog thumbnails (P4-03): each model drawn by three.js in the headless Chromium of the E2E
// tests (SwiftShader, so no GPU is needed), always with the same camera, lights and size, and saved
// as a 256 px WebP with a transparent background. build-models.mjs calls it for the models whose
// file changed; `--check` never renders (CI machines may draw a few pixels differently).
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

export const THUMBNAIL_SIZE = 256;
const ORIGIN = 'http://thumbnails.catalog.invalid';

const PAGE = `<!doctype html>
<script type="importmap">
{ "imports": { "three": "/three/build/three.module.js", "three/addons/": "/three/examples/jsm/" } }
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const size = ${THUMBNAIL_SIZE};
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(size, size);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);

// Fronts face +Z: a three-quarter view from the front right, slightly above.
const VIEW = new THREE.Vector3(0.6, 0.45, 1).normalize();
const FOV = 30;

window.renderThumbnail = async (base64, slots) => {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x80848c, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-3, 1, -1);
  scene.add(fill);
  const model = gltf.scene;
  model.traverse((node) => {
    if (!node.isMesh) return;
    const slot = slots.find((candidate) => candidate.id === node.material.name);
    node.material.dispose();
    const { tint, roughness, metalness } = slot.default;
    node.material = new THREE.MeshStandardMaterial({ color: tint, roughness, metalness });
    if (slot.emissive) node.material.emissive.set(tint);
  });
  scene.add(model);
  const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
  const distance = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.02;
  camera.position.copy(sphere.center).addScaledVector(VIEW, distance);
  camera.lookAt(sphere.center);
  renderer.render(scene, camera);
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.dispose();
    node.material.dispose();
  });
  return renderer.domElement.toDataURL('image/webp', 0.9);
};
window.thumbnailsReady = true;
</script>`;

/**
 * Renders `models` (`{ id, bytes, slots }`, the GLB and its manifest slots) and returns a map from
 * id to WebP bytes. `webRoot` is apps/web, whose Playwright and three are used.
 */
export async function renderThumbnails(webRoot, models) {
  const requireWeb = createRequire(resolve(webRoot, 'package.json'));
  const { chromium } = requireWeb('@playwright/test');
  const threeRoot = resolve(requireWeb.resolve('three'), '../..');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(`${ORIGIN}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE });
      if (!path.startsWith('/three/') || path.includes('..')) return route.abort();
      const body = await readFile(resolve(threeRoot, path.slice('/three/'.length)));
      return route.fulfill({ contentType: 'text/javascript', body });
    });
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => window.thumbnailsReady === true);
    const thumbnails = new Map();
    for (const model of models) {
      const url = await page.evaluate(
        ([base64, slots]) => window.renderThumbnail(base64, slots),
        [Buffer.from(model.bytes).toString('base64'), model.slots],
      );
      if (!url.startsWith('data:image/webp;base64,')) throw new Error(`${model.id}: no WebP`);
      thumbnails.set(model.id, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    }
    if (errors.length > 0) throw new Error(`Thumbnail page errors:\n${errors.join('\n')}`);
    return thumbnails;
  } finally {
    await browser.close();
  }
}
