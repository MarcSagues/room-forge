// The optimisation steps of the catalog pipeline (P4-03): quantisation keeps the geometry and
// the loader reads it, file names carry the content hash, the budget report and the build are
// deterministic. Run with: pnpm test:arch
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModels, loadGenerator } from '../catalog/build-models.mjs';
import {
  budgetReport,
  hasContentHash,
  hashedName,
  quantizeGeometry,
} from '../catalog/optimize.mjs';

const { THREE, GLTFExporter, GLTFLoader } = await loadGenerator();
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
};

/** A curved fixture, off-centre and twice as long along x as along the other axes. */
function fixture() {
  return new THREE.TorusKnotGeometry(0.3, 0.08, 96, 12).scale(2, 1, 1).translate(0.9, 0.4, -0.2);
}

async function glbOf(geometry, transform) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'top' }));
  if (transform) {
    mesh.position.fromArray(transform.offset);
    mesh.scale.setScalar(transform.scale);
  }
  return Buffer.from(await new GLTFExporter().parseAsync(mesh, { binary: true }));
}

async function parse(bytes) {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(data, '');
  gltf.scene.updateMatrixWorld(true);
  let found;
  gltf.scene.traverse((node) => {
    if (node.isMesh) found = node;
  });
  return found;
}

test('quantised geometry loads back within 0.1 mm, with unit normals, in fewer bytes', async () => {
  const original = fixture();
  const plain = await glbOf(original.clone());
  const quantized = original.clone();
  const transform = quantizeGeometry(THREE, quantized);
  assert.equal(quantized.getAttribute('position').array.constructor, Int16Array);
  assert.equal(quantized.getAttribute('uv').array.constructor, Uint16Array);
  const bytes = await glbOf(quantized, transform);
  assert.ok(bytes.length < plain.length * 0.8, `${bytes.length} vs ${plain.length}`);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.deepEqual(json.extensionsRequired, ['KHR_mesh_quantization']);

  const mesh = await parse(bytes);
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const expected = original.getAttribute('position');
  assert.equal(position.count, expected.count);
  const point = new THREE.Vector3();
  let worst = 0;
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    worst = Math.max(worst, point.distanceTo(new THREE.Vector3().fromBufferAttribute(expected, i)));
    const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    assert.ok(Math.abs(length - 1) < 1e-3, `normal ${i} has length ${length}`);
  }
  assert.ok(worst < 1e-4, `worst error ${worst} m`);
});

test('UVs outside [0, 1] stay floats: uint16 could not hold them', () => {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.getAttribute('uv').array[0] = 2;
  quantizeGeometry(THREE, geometry);
  assert.equal(geometry.getAttribute('uv').array.constructor, Float32Array);
});

test('file names carry the hash of their content', () => {
  const a = hashedName('desk.office.140', Buffer.from('a'), 'glb');
  assert.match(a, /^desk\.office\.140\.[0-9a-f]{10}\.glb$/);
  assert.equal(a, hashedName('desk.office.140', Buffer.from('a'), 'glb'));
  assert.notEqual(a, hashedName('desk.office.140', Buffer.from('b'), 'glb'));
  assert.ok(hasContentHash(`models/${a}`, Buffer.from('a')));
  assert.ok(!hasContentHash(`models/${a}`, Buffer.from('b')));
  assert.ok(!hasContentHash('models/desk.office.140.glb', Buffer.from('a')));
});

test('the budget report lists each model, flags the ones over budget and adds up', () => {
  const row = (id, triangles, before, after) => ({
    id,
    triangles,
    materials: 3,
    textureBytes: 0,
    before,
    after,
  });
  const report = budgetReport(
    [row('desk.a', 3300, 100_000, 70_000), row('chair.b', 25_000, 400_000, 310_000)],
    { triangles: 20_000, bytes: 300_000 },
  );
  const lines = report.split('\n');
  assert.equal(lines.length, 5);
  assert.equal(lines[2], '| desk.a | 3300 | 3 | 0 | 100.0 | 70.0 | 30 % | ok |');
  assert.match(lines[3], /^\| chair\.b \| 25000 .* \| OVER \|$/);
  assert.equal(lines[4], '| total | | | | 500.0 | 380.0 | 24 % | |');
});

test('building twice gives the same files and hashes', async () => {
  const first = await buildModels();
  const second = await buildModels();
  assert.deepEqual([...first.files.keys()], [...second.files.keys()]);
  for (const [file, bytes] of first.files) assert.ok(bytes.equals(second.files.get(file)), file);
  assert.equal(first.manifest, second.manifest);
  // Without a renderer nothing is drawn: every model is reported as needing its thumbnail.
  assert.equal(first.staleThumbnails.length, 15);
});
