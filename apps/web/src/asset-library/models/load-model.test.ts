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

/** The hashed file of a shipped model (P4-03), from the manifest. */
const fileOf = (id: string) => {
  const item = manifest.items.find((entry) => entry.id === id);
  if (!item) throw new Error(`${id} is not in the manifest`);
  return item.source.file;
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

describe('the LED strip model (P4-10)', () => {
  it('is one section all along x, so stretching it from 0.5 to 3 m keeps the section exact', async () => {
    const parts = await parseModelParts(glb(fileOf('led.strip.1m')));
    for (const length of [0.5, 1, 3]) {
      for (const part of parts) {
        const geometry = part.geometry.clone().scale(length, 1, 1);
        const xs = new Set<number>();
        const position = geometry.getAttribute('position');
        for (let i = 0; i < position.count; i += 1) xs.add(Math.round(position.getX(i) * 1e4));
        // Every vertex sits on one of the two ends: no end cap or bevel to be distorted.
        expect([...xs].sort((a, b) => a - b)).toEqual([-length * 5000, length * 5000]);
        geometry.computeBoundingBox();
        expect(geometry.boundingBox?.max.y).toBeLessThanOrEqual(0.0161);
        geometry.dispose();
      }
    }
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

  it.each(manifest.items.map((item) => [item.id, item]))(
    'turns the quantised file (KHR_mesh_quantization) of %s back into float metres in its box',
    async (_, item) => {
      const parts = await parseModelParts(glb(item.source.file));
      for (const part of parts) {
        for (const attribute of Object.values(part.geometry.attributes)) {
          expect(attribute.array).toBeInstanceOf(Float32Array);
          expect(attribute.normalized).toBe(false);
        }
        part.geometry.computeBoundingBox();
        const box = part.geometry.boundingBox;
        const { w, h, d } = item.size;
        const margin = 0.003;
        expect(box?.min.y).toBeGreaterThanOrEqual(-margin);
        expect(box?.max.y).toBeLessThanOrEqual(h + margin);
        expect(Math.max(-(box?.min.x ?? 0), box?.max.x ?? 0)).toBeLessThanOrEqual(w / 2 + margin);
        expect(Math.max(-(box?.min.z ?? 0), box?.max.z ?? 0)).toBeLessThanOrEqual(d / 2 + margin);
        const normal = part.geometry.getAttribute('normal');
        for (let i = 0; i < normal.count; i += 1) {
          const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
          expect(length).toBeCloseTo(1, 3);
        }
      }
    },
  );
});

describe('loadModelParts', () => {
  it('downloads the file and parses it', async () => {
    const file = fileOf('monitor.27.flat');
    const data = glb(file);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(data)),
    );
    expect(await loadModelParts(`/assets/${file}`)).toHaveLength(3);
    expect(fetch).toHaveBeenCalledWith(`/assets/${file}`);
  });

  it('fails on an HTTP error instead of parsing the error page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 })),
    );
    await expect(loadModelParts('/assets/models/x.glb')).rejects.toThrow('HTTP 404');
  });
});
