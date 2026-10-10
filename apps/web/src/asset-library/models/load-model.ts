import { type BufferGeometry, type Material, Matrix4, type Mesh, type Object3D } from 'three';

/** One mesh of a catalog model: its geometry and the colour slot it is drawn with. */
export interface ModelPart {
  readonly slot: string;
  readonly geometry: BufferGeometry;
}

const IDENTITY = new Matrix4();

/**
 * Downloads and parses a catalog GLB (P4-04). three's GLTFLoader is imported here, on first use,
 * so it is a chunk of its own and never part of the editor's initial JavaScript.
 */
export async function loadModelParts(url: string): Promise<ModelPart[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return parseModelParts(await response.arrayBuffer());
}

export async function parseModelParts(data: ArrayBuffer): Promise<ModelPart[]> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().parseAsync(data, '');
  return modelParts(gltf.scene);
}

/**
 * The geometries of a loaded scene, each with its transform baked in and named after its
 * material, which is the colour slot of the manifest. The file's own materials are dropped: the
 * scene draws every slot with a shared material from the MaterialFactory.
 */
export function modelParts(root: Object3D): ModelPart[] {
  root.updateMatrixWorld(true);
  const parts: ModelPart[] = [];
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.matrixWorld.equals(IDENTITY)) mesh.geometry.applyMatrix4(mesh.matrixWorld);
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    parts.push({ slot: materials[0]?.name || mesh.name, geometry: mesh.geometry });
    for (const material of materials) disposeMaterial(material);
  });
  return parts;
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if ((value as { isTexture?: boolean } | null)?.isTexture)
      (value as { dispose(): void }).dispose();
  }
  material.dispose();
}
