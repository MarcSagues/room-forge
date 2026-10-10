/** What the catalog validator needs to know about a GLB, read without three.js. */
export interface GlbStats {
  triangles: number;
  bytes: number;
}

interface GltfJson {
  accessors?: Array<{ count: number }>;
  meshes?: Array<{
    primitives: Array<{ indices?: number; mode?: number; attributes: { POSITION?: number } }>;
  }>;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"
const TRIANGLES = 4;

/**
 * Triangles and size of a binary glTF file, from its JSON chunk: every triangle-list primitive
 * counts its indices (or vertices, when it has none) over three. Throws on anything that is not
 * a GLB with only triangle lists, so the manifest cannot describe a file it does not understand.
 */
export function glbStats(file: Uint8Array): GlbStats {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (file.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a GLB');
  if (view.getUint32(8, true) !== file.byteLength) throw new Error('Truncated GLB');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK) throw new Error('The GLB has no JSON chunk first');
  const json = JSON.parse(new TextDecoder().decode(file.subarray(20, 20 + length))) as GltfJson;
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) throw new Error('Only triangle lists');
      const accessor = primitive.indices ?? primitive.attributes.POSITION;
      const count = accessor === undefined ? undefined : json.accessors?.[accessor]?.count;
      if (count === undefined) throw new Error('A primitive without vertices');
      triangles += count / 3;
    }
  }
  return { triangles, bytes: file.byteLength };
}
