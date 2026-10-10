// Throwaway benchmark for P2-11: cost of real lights, shadows, emissives and bloom in a ~30-object
// room, plus which light changes trigger a shader recompile. Not product code (see README).
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const params = new URLSearchParams(location.search);
const width = Number(params.get('w') ?? 1280);
const height = Number(params.get('h') ?? 720);
const frames = Number(params.get('k') ?? 60);
const repeats = Number(params.get('r') ?? 1);
const warmup = 5;
const mode = params.get('mode') ?? 'matrix';
const status = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(width, height);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
document.getElementById('stage').append(renderer.domElement);
RectAreaLightUniformsLib.init();

const gl = renderer.getContext();
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const gpuName = debugInfo
  ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
  : gl.getParameter(gl.RENDERER);
const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const pixel = new Uint8Array(4);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d1117');
const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 50);
camera.position.set(4.6, 3.1, 4.4);
camera.lookAt(-0.3, 0.7, -0.4);

// --- Room and ~30 furniture-like objects with shared geometries/materials -----------------------
const palette = [
  '#c6a47d',
  '#2c3440',
  '#d9dde0',
  '#6b8f71',
  '#8a4f3d',
  '#3f5f8a',
  '#b9b2a6',
  '#222222',
];
const materialSets = {
  standard: palette.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 })),
  phong: palette.map((color) => new THREE.MeshPhongMaterial({ color, shininess: 30 })),
  lambert: palette.map((color) => new THREE.MeshLambertMaterial({ color })),
};
const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  sphere: new THREE.SphereGeometry(0.5, 48, 32),
  knot: new THREE.TorusKnotGeometry(0.3, 0.1, 160, 16),
};
const meshes = [];

function addMesh(geometry, colorIndex, position, scale, parent = scene) {
  const mesh = new THREE.Mesh(geometries[geometry], materialSets.standard[colorIndex]);
  mesh.userData.colorIndex = colorIndex;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  meshes.push(mesh);
  return mesh;
}

addMesh('box', 6, [0, -0.05, 0], [5, 0.1, 4]);
addMesh('box', 2, [0, 1.35, -2.05], [5, 2.7, 0.1]);
addMesh('box', 2, [-2.55, 1.35, 0], [0.1, 2.7, 4]);

const recipes = [
  (g) => {
    addMesh('box', 0, [0, 0.74, 0], [1.4, 0.04, 0.7], g);
    for (const [x, z] of [
      [-0.65, -0.3],
      [0.65, -0.3],
      [-0.65, 0.3],
      [0.65, 0.3],
    ]) {
      addMesh('cylinder', 1, [x, 0.36, z], [0.05, 0.72, 0.05], g);
    }
  },
  (g) => {
    addMesh('box', 1, [0, 0.48, 0], [0.55, 0.1, 0.55], g);
    addMesh('box', 5, [0, 0.9, -0.25], [0.55, 0.8, 0.08], g);
    addMesh('cylinder', 7, [0, 0.22, 0], [0.08, 0.44, 0.08], g);
  },
  (g) => {
    addMesh('box', 7, [0, 0.35, 0], [0.7, 0.4, 0.03], g);
    addMesh('cylinder', 1, [0, 0.1, 0.05], [0.06, 0.2, 0.06], g);
  },
  (g) => {
    addMesh('box', 4, [0, 0.9, 0], [0.9, 1.8, 0.35], g);
    addMesh('knot', 3, [0, 1.95, 0], [0.4, 0.4, 0.4], g);
  },
  (g) => {
    addMesh('cylinder', 4, [0, 0.2, 0], [0.35, 0.4, 0.35], g);
    addMesh('sphere', 3, [0, 0.6, 0], [0.55, 0.55, 0.55], g);
  },
];
for (let index = 0; index < 30; index += 1) {
  const group = new THREE.Group();
  recipes[index % recipes.length](group);
  const column = index % 6;
  const row = Math.floor(index / 6);
  group.position.set(-2 + column * 0.8, 0, -1.6 + row * 0.75);
  group.scale.setScalar(0.55);
  group.rotation.y = (index * 0.7) % Math.PI;
  scene.add(group);
}

function useMaterials(kind) {
  for (const mesh of meshes) mesh.material = materialSets[kind][mesh.userData.colorIndex];
}

// --- Base lighting: hemisphere + sun (sun casts shadow only in the shadow configs) ---------------
const hemi = new THREE.HemisphereLight('#bcd3ff', '#2a2a33', 0.5);
const sun = new THREE.DirectionalLight('#fff1dc', 1.2);
sun.position.set(-3, 6, 4);
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 1 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.normalBias = 0.03;
scene.add(hemi, sun);

// --- User lights: placed along the walls like LED strips / bars / lamps --------------------------
function lightSlot(index, count) {
  const t = count <= 1 ? 0.5 : index / count;
  const along = t * 9; // walk the two back walls (5 m + 4 m)
  const x = along < 5 ? -2.4 + along : -2.4;
  const z = along < 5 ? -1.9 : -1.9 + (along - 5);
  const color = new THREE.Color().setHSL((index * 0.137) % 1, 0.85, 0.55);
  return { position: new THREE.Vector3(x, 2.3 - (index % 3) * 0.6, z), color };
}

let userLights = [];
function setUserLights(type, count) {
  for (const light of userLights) {
    scene.remove(light);
    if (light.target) scene.remove(light.target);
    light.dispose();
  }
  userLights = [];
  for (let index = 0; index < count; index += 1) {
    const { position, color } = lightSlot(index, count);
    let light;
    if (type === 'point') light = new THREE.PointLight(color, 3, 5, 2);
    if (type === 'spot') {
      light = new THREE.SpotLight(color, 6, 6, 0.7, 0.4, 2);
      light.target.position.set(position.x * 0.3, 0, position.z * 0.3);
      scene.add(light.target);
    }
    if (type === 'rect') {
      light = new THREE.RectAreaLight(color, 6, 1, 0.06);
      light.lookAt(0, 1, 0);
    }
    light.position.copy(position);
    if (type === 'rect') light.lookAt(0, 1, 0);
    scene.add(light);
    userLights.push(light);
  }
}

// --- Emissive-only "fake" lights (LED strips) ---------------------------------------------------
const stripGeometry = new THREE.BoxGeometry(1, 0.025, 0.025);
const strips = [];
for (let index = 0; index < 20; index += 1) {
  const { position, color } = lightSlot(index, 20);
  const material = new THREE.MeshBasicMaterial({
    color: color.multiplyScalar(4),
    toneMapped: false,
  });
  const strip = new THREE.Mesh(stripGeometry, material);
  strip.position.copy(position).add(new THREE.Vector3(0, 0, 0.06));
  if (position.x < -2.3) strip.rotation.y = Math.PI / 2;
  strip.visible = false;
  scene.add(strip);
  strips.push(strip);
}
const setStrips = (visible) => {
  for (const strip of strips) strip.visible = visible;
};

// --- Bloom pipeline ------------------------------------------------------------------------------
const composerTarget = new THREE.WebGLRenderTarget(width, height, {
  type: THREE.HalfFloatType,
  samples: 4,
});
const composer = new EffectComposer(renderer, composerTarget);
composer.setPixelRatio(1);
composer.setSize(width, height);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.8, 0.4, 1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let pipeline = 'direct';
function setPipeline(next) {
  pipeline = next;
  bloom.enabled = next !== 'composer';
  const scale = next === 'bloom-half' ? 0.5 : 1;
  bloom.setSize(width * scale, height * scale);
}

function draw() {
  renderer.info.reset();
  if (pipeline === 'direct') renderer.render(scene, camera);
  else composer.render();
}

// --- Timing ----------------------------------------------------------------------------------------
function syncGpu() {
  // Reading one pixel forces the CPU to wait for the frame: wall time = CPU + GPU (+ sync overhead).
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
}

const nextTask = () => new Promise((done) => setTimeout(done, 0));

async function collectQueries(queries) {
  const results = [];
  for (const query of queries) {
    let tries = 0;
    while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && tries < 200) {
      tries += 1;
      await new Promise((done) => requestAnimationFrame(done));
    }
    const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT);
    if (!disjoint && tries < 200) results.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
    gl.deleteQuery(query);
  }
  return results;
}

const stat = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(3));
};

async function firstFrame() {
  const before = renderer.info.programs.length;
  const start = performance.now();
  draw();
  syncGpu();
  return {
    programsBefore: before,
    programsAfter: renderer.info.programs.length,
    firstFrameMs: Number((performance.now() - start).toFixed(2)),
  };
}

async function steady(count) {
  const wall = [];
  const queries = [];
  for (let index = 0; index < count; index += 1) {
    const query = timerExt ? gl.createQuery() : null;
    if (query) gl.beginQuery(timerExt.TIME_ELAPSED_EXT, query);
    const start = performance.now();
    draw();
    if (query) gl.endQuery(timerExt.TIME_ELAPSED_EXT);
    syncGpu();
    wall.push(performance.now() - start);
    if (query) queries.push(query);
    if (index % 10 === 9) await nextTask();
  }
  const gpu = await collectQueries(queries);
  return {
    wallMedianMs: stat(wall, 0.5),
    wallP95Ms: stat(wall, 0.95),
    gpuMedianMs: stat(gpu, 0.5),
    gpuP95Ms: stat(gpu, 0.95),
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
}

async function measure(id, configure) {
  status.textContent = `Midiendo ${id}…`;
  await nextTask();
  configure();
  const first = await firstFrame();
  for (let index = 0; index < warmup; index += 1) {
    draw();
    syncGpu();
  }
  const timing = await steady(frames);
  return { id, ...first, ...timing, fps: Math.round(1000 / Math.max(timing.wallMedianMs, 0.1)) };
}

function reset(material = 'standard') {
  useMaterials(material);
  setUserLights('point', 0);
  setStrips(false);
  setPipeline('direct');
  sun.castShadow = false;
  renderer.shadowMap.autoUpdate = true;
}

// --- Experiments -----------------------------------------------------------------------------------
async function runMatrix() {
  const rows = [];
  for (const material of ['standard', 'phong', 'lambert']) {
    for (const type of ['point', 'spot', 'rect']) {
      if (type === 'rect' && material !== 'standard') continue; // RectAreaLight needs Standard/Physical
      for (const count of [0, 2, 4, 8, 16]) {
        if (count === 0 && type !== 'point') continue;
        rows.push(
          await measure(`${material}/${type}/${count}`, () => {
            reset(material);
            setUserLights(type, count);
          }),
        );
      }
    }
  }
  const shadowCases = {
    'shadow/none': () => {},
    'shadow/sun-2048-every-frame': () => {
      sun.castShadow = true;
    },
    'shadow/sun-2048-static': () => {
      sun.castShadow = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
    },
    'shadow/point-1024-every-frame': () => {
      userLights[0].castShadow = true;
      userLights[0].shadow.mapSize.set(1024, 1024);
    },
  };
  for (const [id, extra] of Object.entries(shadowCases)) {
    rows.push(
      await measure(id, () => {
        reset();
        setUserLights('point', 8);
        extra();
      }),
    );
  }
  const glowCases = {
    'glow/emissive-20-no-lights': () => setStrips(true),
    'glow/emissive-20+8-point': () => {
      setStrips(true);
      setUserLights('point', 8);
    },
    'glow/composer-no-bloom+8-point': () => {
      setStrips(true);
      setUserLights('point', 8);
      setPipeline('composer');
    },
    'glow/bloom-full+8-point': () => {
      setStrips(true);
      setUserLights('point', 8);
      setPipeline('bloom-full');
    },
    'glow/bloom-half+8-point': () => {
      setStrips(true);
      setUserLights('point', 8);
      setPipeline('bloom-half');
    },
  };
  for (const [id, extra] of Object.entries(glowCases)) {
    rows.push(
      await measure(id, () => {
        reset();
        extra();
      }),
    );
  }
  return rows;
}

// GPU clocks and background load drift between configs; repeating the whole matrix and keeping the
// median of the per-run medians makes neighbouring rows comparable. First-frame data comes from run 1
// (the only one that compiles).
async function repeatMatrix() {
  const runs = [];
  for (let index = 0; index < repeats; index += 1) runs.push(await runMatrix());
  const median = (values) =>
    stat(
      values.filter((value) => value !== null),
      0.5,
    );
  return runs[0].map((row, index) => {
    const same = runs.map((run) => run[index]);
    const wallMedianMs = median(same.map((r) => r.wallMedianMs));
    return {
      ...row,
      wallMedianMs,
      wallP95Ms: median(same.map((r) => r.wallP95Ms)),
      gpuMedianMs: median(same.map((r) => r.gpuMedianMs)),
      gpuP95Ms: median(same.map((r) => r.gpuP95Ms)),
      fps: Math.round(1000 / Math.max(wallMedianMs, 0.1)),
    };
  });
}

async function runRecompile() {
  reset();
  setUserLights('point', 8);
  const each = (list, apply) => {
    list.forEach(apply);
  };
  const steps = [
    ['initial (8 point)', () => {}],
    ['change color of all', () => each(userLights, (l, i) => l.color.setHSL(i / 8, 1, 0.5))],
    [
      'change intensity of all',
      () =>
        each(userLights, (l) => {
          l.intensity *= 1.7;
        }),
    ],
    ['move all', () => each(userLights, (l) => l.position.multiplyScalar(0.9))],
    [
      'intensity = 0 on 3 ("off")',
      () =>
        each(userLights.slice(0, 3), (l) => {
          l.intensity = 0;
        }),
    ],
    [
      'visible = false on 1',
      () => {
        userLights[7].visible = false;
      },
    ],
    [
      'visible = true again',
      () => {
        userLights[7].visible = true;
      },
    ],
    ['add 9th point light', () => scene.add(addExtraLight())],
    ['remove 9th (back to 8)', () => scene.remove(userLights[8])],
    [
      'castShadow on 1 point',
      () => {
        userLights[0].castShadow = true;
      },
    ],
    [
      'castShadow off',
      () => {
        userLights[0].castShadow = false;
      },
    ],
    ['swap 1 point for spot', () => swapForSpot()],
    ['emissive strips on (no lights change)', () => setStrips(true)],
  ];
  const rows = [];
  for (const [id, change] of steps) {
    change();
    const first = await firstFrame();
    const timing = await steady(10);
    rows.push({ id, ...first, wallMedianMs: timing.wallMedianMs, gpuMedianMs: timing.gpuMedianMs });
  }
  return rows;
}

function addExtraLight() {
  const light = new THREE.PointLight('#ffffff', 3, 5, 2);
  light.position.set(0, 2.2, 0);
  userLights.push(light);
  return light;
}

function swapForSpot() {
  const old = userLights[1];
  scene.remove(old);
  const spot = new THREE.SpotLight(old.color, 6, 6, 0.7, 0.4, 2);
  spot.position.copy(old.position);
  scene.add(spot, spot.target);
  userLights[1] = spot;
}

function viewConfig(name) {
  reset();
  const [lights, extra] = name.split('+');
  const [type, count] = lights.split('-');
  setUserLights(type, Number(count));
  if (extra === 'bloom') {
    setStrips(true);
    setPipeline('bloom-half');
  }
  if (extra === 'strips') setStrips(true);
  hemi.intensity = 0.15;
  sun.intensity = 0;
  draw();
}

function renderTable(title, rows) {
  const columns = Object.keys(rows[0]);
  const head = columns.map((c) => `<th>${c}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${row[c] ?? '—'}</td>`).join('')}</tr>`)
    .join('');
  return `<h2 style="margin:16px">${title}</h2><table><tr>${head}</tr>${body}</table>`;
}

const state = { gpu: gpuName, timerQuery: Boolean(timerExt), width, height, frames, done: false };
window.__LIGHT_SPIKE__ = { state, renderer, scene, viewConfig };

async function run() {
  document.getElementById('run').disabled = true;
  if (mode === 'recompile') state.recompile = await runRecompile();
  else state.matrix = await repeatMatrix();
  state.done = true;
  status.textContent = `${gpuName} · ${width}×${height} · ${frames} frames`;
  const results = document.getElementById('results');
  if (state.matrix) results.innerHTML = renderTable('Matriz', state.matrix);
  if (state.recompile) results.innerHTML = renderTable('Recompilación', state.recompile);
}

document.getElementById('run').addEventListener('click', run);
document
  .getElementById('copy')
  .addEventListener('click', () => navigator.clipboard.writeText(JSON.stringify(state, null, 2)));
if (params.get('view')) viewConfig(params.get('view'));
else if (params.get('auto') === '1') run();
else status.textContent = `${gpuName} · timer query: ${timerExt ? 'sí' : 'no'}`;
