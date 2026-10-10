import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const variants = [
  {
    id: 'desk-office',
    family: 'desk',
    name: { es: 'Oficina · 140', en: 'Office · 140' },
    size: [1.4, 0.74, 0.7],
  },
  {
    id: 'desk-gaming',
    family: 'desk',
    name: { es: 'Gaming · 160', en: 'Gaming · 160' },
    size: [1.6, 0.75, 0.75],
  },
  {
    id: 'desk-studio',
    family: 'desk',
    name: { es: 'Estudio · 160', en: 'Studio · 160' },
    size: [1.6, 0.75, 0.75],
  },
  {
    id: 'chair-racing',
    family: 'chair',
    name: { es: 'Gaming · deportiva', en: 'Gaming · racing' },
    size: [0.68, 1.3, 0.7],
  },
  {
    id: 'chair-mesh',
    family: 'chair',
    name: { es: 'Gaming · ergonómica', en: 'Gaming · ergonomic' },
    size: [0.68, 1.3, 0.7],
  },
  {
    id: 'chair-executive',
    family: 'chair',
    name: { es: 'Gaming · acolchada', en: 'Gaming · padded' },
    size: [0.68, 1.3, 0.7],
  },
  {
    id: 'monitor-flat',
    family: 'monitor',
    name: { es: 'Plano · 27 pulgadas', en: 'Flat · 27 inch' },
    size: [0.61, 0.45, 0.2],
  },
  {
    id: 'monitor-wide',
    family: 'monitor',
    name: { es: 'Curvo · 34 pulgadas', en: 'Curved · 34 inch' },
    size: [0.81, 0.45, 0.25],
  },
  {
    id: 'monitor-arm',
    family: 'monitor',
    name: { es: 'Brazo · 27 pulgadas', en: 'Arm · 27 inch' },
    size: [0.61, 0.45, 0.2],
  },
];

export const slots = {
  desk: [
    { id: 'top', label: { es: 'Tablero', en: 'Desktop' }, color: '#c6a47d' },
    { id: 'frame', label: { es: 'Estructura', en: 'Frame' }, color: '#252c39' },
    { id: 'accent', label: { es: 'Detalles', en: 'Accents' }, color: '#75d5c9' },
  ],
  chair: [
    { id: 'upholstery', label: { es: 'Tapizado', en: 'Upholstery' }, color: '#333e52' },
    { id: 'frame', label: { es: 'Estructura', en: 'Frame' }, color: '#202734' },
    {
      id: 'accent',
      label: { es: 'Costuras y detalles', en: 'Trim and accents' },
      color: '#75d5c9',
    },
  ],
  monitor: [
    { id: 'body', label: { es: 'Carcasa', en: 'Housing' }, color: '#252c39' },
    { id: 'stand', label: { es: 'Soporte', en: 'Stand' }, color: '#596677' },
    { id: 'screen', label: { es: 'Pantalla', en: 'Screen' }, color: '#467b93' },
  ],
};

const geometryCache = new Map();
const up = new THREE.Vector3(0, 1, 0);

function buildGeometry(definition) {
  const parts = new Map(slots[definition.family].map((slot) => [slot.id, []]));
  function add(slot, geometry, position, rotation = [0, 0, 0]) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(matrix);
    parts.get(slot).push(geometry);
  }
  function box(slot, size, position, radius = 0.012, rotation) {
    add(
      slot,
      new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map((v) => v / 3))),
      position,
      rotation,
    );
  }
  function cylinder(slot, radius, height, position, rotation, topRadius = radius) {
    add(slot, new THREE.CylinderGeometry(topRadius, radius, height, 12), position, rotation);
  }
  function rod(slot, start, end, radius) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 10);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
    geometry.translate(...a.add(b).multiplyScalar(0.5).toArray());
    parts.get(slot).push(geometry);
  }
  const [w, h, d] = definition.size;
  if (definition.family === 'desk') {
    box('top', [w, 0.045, d], [0, h - 0.0225, 0], 0.018);
    box('frame', [w - 0.16, 0.065, 0.05], [0, h - 0.1, d / 2 - 0.12]);
    if (definition.id === 'desk-office') {
      for (const x of [-w / 2 + 0.085, w / 2 - 0.085]) {
        for (const z of [-d / 2 + 0.08, d / 2 - 0.08]) {
          box('frame', [0.055, h - 0.045, 0.055], [x, (h - 0.045) / 2, z]);
          box('accent', [0.065, 0.014, 0.065], [x, 0.007, z]);
        }
      }
    } else {
      for (const x of [-w / 2 + 0.16, w / 2 - 0.16]) {
        box('frame', [0.075, 0.025, d - 0.06], [x, 0.0125, 0]);
        if (definition.id === 'desk-gaming') {
          box('frame', [0.06, h - 0.07, 0.065], [x, (h - 0.045) / 2, 0.055]);
          rod('accent', [x, 0.07, -0.28], [x, h - 0.12, 0.12], 0.017);
        } else {
          rod('frame', [x, 0.025, -d / 2 + 0.075], [x, h - 0.045, 0], 0.027);
          rod('frame', [x, 0.025, d / 2 - 0.075], [x, h - 0.045, 0], 0.027);
          box('accent', [0.08, 0.035, d - 0.055], [x, 0.05, 0]);
        }
      }
      box('accent', [w - 0.12, 0.012, 0.012], [0, h - 0.045, -d / 2 + 0.015], 0.003);
    }
    box('frame', [0.21, 0.008, 0.018], [0, h - 0.046, d / 2 - 0.05], 0.002);
  } else if (definition.family === 'chair') {
    cylinder('frame', 0.043, 0.31, [0, 0.245, 0]);
    cylinder('accent', 0.054, 0.055, [0, 0.4, 0]);
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const x = Math.sin(angle) * 0.29;
      const z = Math.cos(angle) * 0.29;
      rod('frame', [0, 0.14, 0], [x, 0.07, z], 0.022);
      cylinder('frame', 0.032, 0.048, [x, 0.032, z], [Math.PI / 2, 0, angle]);
    }
    box('upholstery', [0.52, 0.1, 0.49], [0, 0.48, -0.03], 0.04);
    box('frame', [0.43, 0.025, 0.4], [0, 0.415, -0.03]);
    for (const x of [-0.315, 0.315]) {
      box('frame', [0.024, 0.22, 0.05], [x, 0.59, 0.035]);
      box('upholstery', [0.05, 0.045, 0.28], [x, 0.71, -0.035]);
    }
    if (definition.id === 'chair-mesh') {
      for (const x of [-0.225, 0.225]) box('frame', [0.034, 0.58, 0.05], [x, 0.86, 0.23]);
      for (let i = 0; i < 9; i++)
        box('upholstery', [0.42, 0.035, 0.025], [0, 0.6 + i * 0.06, 0.23], 0.007);
      box('accent', [0.38, 0.075, 0.065], [0, 0.68, 0.2]);
      box('upholstery', [0.32, 0.15, 0.085], [0, 1.225, 0.22], 0.03);
      rod('frame', [0, 1.09, 0.25], [0, 1.2, 0.25], 0.02);
    } else {
      box('upholstery', [0.46, 0.68, 0.095], [0, 0.96, 0.235], 0.045);
      if (definition.id === 'chair-racing') {
        for (const x of [-0.205, 0.205]) {
          box('accent', [0.065, 0.58, 0.12], [x, 0.935, 0.21], 0.02);
          box('accent', [0.045, 0.02, 0.39], [x, 0.533, -0.035], 0.007);
        }
        box('accent', [0.28, 0.09, 0.06], [0, 0.71, 0.165], 0.02);
        for (const x of [-0.085, 0.085]) box('frame', [0.08, 0.038, 0.005], [x, 1.17, 0.185], 0.01);
      } else {
        for (let i = 0; i < 5; i++)
          box('accent', [0.34, 0.009, 0.008], [0, 0.75 + i * 0.095, 0.184], 0.002);
        box('upholstery', [0.38, 0.14, 0.045], [0, 1.2, 0.169], 0.02);
      }
    }
  } else {
    const wide = definition.id === 'monitor-wide';
    if (wide) {
      const radius = 1.4;
      const angle = 2 * Math.asin((w - 0.035) / (2 * radius));
      const start = Math.PI - angle / 2;
      const centerZ = -radius + 0.027;
      add(
        'body',
        new THREE.CylinderGeometry(
          radius + 0.009,
          radius + 0.009,
          0.337,
          40,
          1,
          true,
          start,
          angle,
        ),
        [0, 0.28, -centerZ],
      );
      add(
        'screen',
        new THREE.CylinderGeometry(
          radius + 0.011,
          radius + 0.011,
          0.303,
          40,
          1,
          true,
          start + 0.008,
          angle - 0.016,
        ),
        [0, 0.283, -centerZ],
      );
    } else {
      box('body', [w, 0.34, 0.033], [0, 0.28, 0.025], 0.012);
      box('screen', [w - 0.027, 0.31, 0.004], [0, 0.283, 0.0065], 0.004);
    }
    if (definition.id === 'monitor-arm') {
      box('stand', [0.12, 0.025, d], [0.12, 0.0125, 0]);
      rod('stand', [0.12, 0.025, 0.08], [0.12, 0.31, 0.08], 0.021);
      rod('stand', [0.12, 0.31, 0.08], [0, 0.31, 0.05], 0.023);
      cylinder('body', 0.032, 0.018, [0.12, 0.3, 0.08], [Math.PI / 2, 0, 0]);
    } else {
      box('stand', [0.035, 0.17, 0.04], [0, 0.097, 0.06]);
      rod('stand', [0, 0.017, 0.055], [-0.19, 0.017, -d / 2 + 0.015], 0.016);
      rod('stand', [0, 0.017, 0.055], [0.19, 0.017, -d / 2 + 0.015], 0.016);
      rod('stand', [0, 0.017, 0.055], [0, 0.017, d / 2 - 0.017], 0.016);
    }
    box('body', [0.045, 0.003, 0.004], [0, 0.119, 0.004], 0.001);
  }
  return [...parts]
    .filter(([, geometries]) => geometries.length)
    .map(([slot, geometries]) => {
      const buffers = geometries.map((geometry) =>
        geometry.index ? geometry.toNonIndexed() : geometry,
      );
      const unindexed = mergeGeometries(buffers);
      const merged = mergeVertices(unindexed);
      unindexed.dispose();
      merged.computeBoundingBox();
      for (const geometry of new Set([...geometries, ...buffers])) geometry.dispose();
      return { slot, geometry: merged };
    });
}

export function createModel(id) {
  const definition = variants.find((variant) => variant.id === id);
  if (!definition) throw new Error(`Unknown model: ${id}`);
  if (!geometryCache.has(id)) geometryCache.set(id, buildGeometry(definition));
  const group = new THREE.Group();
  group.name = id;
  group.userData = {
    variant: id,
    author: 'RoomForge',
    license: 'LicenseRef-RoomForge-Proprietary',
  };
  for (const { slot, geometry } of geometryCache.get(id)) {
    const color = slots[definition.family].find((entry) => entry.id === slot).color;
    const material = new THREE.MeshStandardMaterial({
      name: slot,
      color,
      roughness: slot === 'screen' ? 0.35 : 0.65,
      metalness: ['frame', 'stand'].includes(slot) ? 0.45 : 0,
      side: THREE.DoubleSide,
    });
    if (slot === 'screen') {
      material.emissive.copy(material.color);
      material.emissiveIntensity = 0.35;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = slot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

export function setSlotColor(model, slot, hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Invalid color');
  const mesh = model.children.find((child) => child.name === slot);
  if (!mesh) throw new Error(`Unknown material slot: ${slot}`);
  mesh.material.color.set(hex);
  if (slot === 'screen') mesh.material.emissive.set(hex);
}

export function disposeModelMaterials(model) {
  for (const mesh of model.children) mesh.material.dispose();
}

export function disposeGeometryCache() {
  for (const parts of geometryCache.values()) for (const part of parts) part.geometry.dispose();
  geometryCache.clear();
}
