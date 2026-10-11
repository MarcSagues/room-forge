// Optimisation steps of the catalog pipeline (P4-03), pure functions over three.js geometries and
// bytes. build-models.mjs runs them on every generated model; tools/checks/catalog-pipeline.test.mjs
// tests them. three is passed in: tools load the copy the web app depends on.
import { createHash } from 'node:crypto';

const INT16 = 32767;
const UINT16 = 65535;

/**
 * Quantises a welded, indexed geometry in place (KHR_mesh_quantization, which three's GLTFLoader
 * reads with no decoder, so the strict CSP needs no `wasm-unsafe-eval`): positions to normalised
 * int16 inside the geometry's box, normals to normalised int16 and UVs to normalised uint16 when
 * they fit in [0, 1]. The box is a cube (one scale for all axes) so normals need no correction.
 * Returns the transform that turns the stored values back into metres: `position + offset * scale`.
 */
export function quantizeGeometry(THREE, geometry) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const offset = min.clone().add(max).multiplyScalar(0.5);
  const half = max.clone().sub(min).multiplyScalar(0.5);
  const scale = Math.max(half.x, half.y, half.z) || 1;
  const position = geometry.getAttribute('position');
  const quantized = new Int16Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    quantized[i * 3] = Math.round(((position.getX(i) - offset.x) / scale) * INT16);
    quantized[i * 3 + 1] = Math.round(((position.getY(i) - offset.y) / scale) * INT16);
    quantized[i * 3 + 2] = Math.round(((position.getZ(i) - offset.z) / scale) * INT16);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(quantized, 3, true));
  const normal = geometry.getAttribute('normal');
  if (normal) {
    const values = Int16Array.from(normal.array, (value) => Math.round(value * INT16));
    geometry.setAttribute('normal', new THREE.BufferAttribute(values, 3, true));
  }
  const uv = geometry.getAttribute('uv');
  if (uv?.array.every((value) => value >= 0 && value <= 1)) {
    const values = Uint16Array.from(uv.array, (value) => Math.round(value * UINT16));
    geometry.setAttribute('uv', new THREE.BufferAttribute(values, 2, true));
  }
  geometry.boundingBox = null;
  return { offset: [offset.x, offset.y, offset.z], scale };
}

/** `<id>.<first 10 hex digits of the SHA-256>.<ext>`: a new name whenever the content changes. */
export function hashedName(id, bytes, extension) {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
  return `${id}.${hash}.${extension}`;
}

/** Whether `file` (`folder/<id>.<hash>.<ext>`) carries the hash of `bytes`. */
export function hasContentHash(file, bytes) {
  const match = /([^/]+)\.[0-9a-f]{10}\.([a-z0-9]+)$/.exec(file);
  return match !== null && file.endsWith(hashedName(match[1], bytes, match[2]));
}

/** The budget table printed after a build: one row per model and the total. */
export function budgetReport(rows, budget) {
  const kb = (bytes) => (bytes / 1000).toFixed(1);
  const lines = [
    '| model | triangles | materials | texture bytes | kB before | kB after | saved | budget |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  const total = { before: 0, after: 0 };
  for (const row of rows) {
    total.before += row.before;
    total.after += row.after;
    const within = row.triangles <= budget.triangles && row.after <= budget.bytes;
    lines.push(
      `| ${row.id} | ${row.triangles} | ${row.materials} | ${row.textureBytes} | ${kb(row.before)} | ${kb(row.after)} | ${saved(row)} | ${within ? 'ok' : 'OVER'} |`,
    );
  }
  lines.push(`| total | | | | ${kb(total.before)} | ${kb(total.after)} | ${saved(total)} | |`);
  return lines.join('\n');
}

const saved = ({ before, after }) => `${Math.round((1 - after / before) * 100)} %`;
