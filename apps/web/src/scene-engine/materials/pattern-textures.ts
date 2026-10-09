import type { MaterialPattern } from '@roomforge/core';
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { patternPixels } from './pattern-pixels';

export interface PatternTextures {
  /** The texture of a pattern, drawn the first time it is asked for and shared after that. */
  acquire(pattern: MaterialPattern): DataTexture;
  /** One user less; the texture is freed when the last one lets go. */
  release(pattern: MaterialPattern): void;
  /** Changes the filtering of every texture there is, and of the ones made later. */
  setAnisotropy(anisotropy: number): void;
  /** How many textures are alive. */
  count(): number;
  dispose(): void;
}

/**
 * The textures of the material patterns: one per pattern however many materials show it, counted
 * so that none is kept once nothing uses it (R3F only disposes what it created itself).
 */
export function createPatternTextures(options: {
  size: number;
  anisotropy: number;
}): PatternTextures {
  let anisotropy = options.anisotropy;
  const alive = new Map<MaterialPattern, { texture: DataTexture; users: number }>();

  function make(pattern: MaterialPattern): DataTexture {
    const { size } = options;
    const texture = new DataTexture(
      patternPixels(pattern, size),
      size,
      size,
      RGBAFormat,
      UnsignedByteType,
    );
    // The picture is colour, drawn in sRGB; one repeat is one metre because the UVs are metres.
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
  }

  return {
    acquire(pattern) {
      let entry = alive.get(pattern);
      if (!entry) {
        entry = { texture: make(pattern), users: 0 };
        alive.set(pattern, entry);
      }
      entry.users += 1;
      return entry.texture;
    },
    release(pattern) {
      const entry = alive.get(pattern);
      if (!entry) return;
      entry.users -= 1;
      if (entry.users > 0) return;
      entry.texture.dispose();
      alive.delete(pattern);
    },
    setAnisotropy(next) {
      anisotropy = next;
      for (const { texture } of alive.values()) {
        texture.anisotropy = next;
        texture.needsUpdate = true;
      }
    },
    count: () => alive.size,
    dispose() {
      for (const { texture } of alive.values()) texture.dispose();
      alive.clear();
    },
  };
}
