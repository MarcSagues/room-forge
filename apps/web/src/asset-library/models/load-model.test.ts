// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Texture } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import manifest from '../manifest/catalog.json';
import { loadModelParts, modelParts, parseModelParts } from './load-model';

const assets = fileURLToPath(new URL('../../../public/assets/', import.meta.url));
const glb = (file: string) => {
  const bytes = readFileSync(`${assets}${file}`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

afterEach(() => vi.unstubAllGlobals());

describe('modelParts', () => {
  it('names each geometry after its material and bakes the mesh transform in', () => {
    const root = new Group();
    const material = new MeshStandardMaterial({ name: 'top' });
    const map = { isTexture: true, dispose: vi.fn() } as unknown as Texture;
    material.map = map;
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
    mesh.position.set(0, 2, 0);
    root.add(mesh);
    const dispose = vi.spyOn(material, 'dispose');

    const [part] = modelParts(root);
    part?.geometry.computeBoundingBox();
    expect(part?.slot).toBe('top');
    expect(part?.geometry.boundingBox?.min.y).toBeCloseTo(1.5);
    // The file's materials and textures are not used: they are freed straight away.
    expect(dispose).toHaveBeenCalled();
    expect(map.dispose).toHaveBeenCalled();
  });

  it('falls back to the mesh name when the material has none', () => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    mesh.name = 'frame';
    root.add(mesh);
    expect(modelParts(root).map((part) => part.slot)).toEqual(['frame']);
  });
});

describe('parseModelParts', () => {
  it.each(manifest.items.map((item) => [item.id, item]))(
    'reads %s: one part per colour slot, with the triangles of the manifest',
    async (_, item) => {
      const parts = await parseModelParts(glb(item.source.file));
      expect(parts.map((part) => part.slot).sort()).toEqual(
        item.slots.map((slot) => slot.id).sort(),
      );
      const triangles = parts.reduce((sum, part) => sum + (part.geometry.index?.count ?? 0) / 3, 0);
      expect(triangles).toBe(item.source.triangles);
    },
  );
});

describe('loadModelParts', () => {
  it('downloads the file and parses it', async () => {
    const data = glb('models/monitor.27.flat.glb');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(data)),
    );
    expect(await loadModelParts('/assets/models/monitor.27.flat.glb')).toHaveLength(3);
    expect(fetch).toHaveBeenCalledWith('/assets/models/monitor.27.flat.glb');
  });

  it('fails on an HTTP error instead of parsing the error page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 })),
    );
    await expect(loadModelParts('/assets/models/x.glb')).rejects.toThrow('HTTP 404');
  });
});
