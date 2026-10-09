import type { MaterialPattern, ResolvedMaterial } from '@roomforge/core';
import { Color, MeshStandardMaterial } from 'three';
import { materialKey } from './material-key';
import { createPatternTextures } from './pattern-textures';

export interface MaterialFactoryOptions {
  /** Side of the pattern pictures in pixels, a power of two (default 256). */
  textureSize?: number;
  /** Texture filtering; follows the graphics quality (default 4). */
  anisotropy?: number;
  /** Called after a material was changed in place, so the app can ask for a frame (rule 4). */
  onMutate?: () => void;
}

export interface AcquireOptions {
  /** Drawn see-through (the walls, which fade). Part of what makes two materials the same. */
  transparent?: boolean;
  /**
   * `false` for a material of its own, which the user may change at will (a wall that fades one
   * opacity while its neighbour fades another). The textures are still shared.
   */
  shared?: boolean;
}

/** One user's hold on a material. */
export interface MaterialLease {
  /** The material to draw with. After `update` returned `true` it is another one. */
  readonly material: MeshStandardMaterial;
  /**
   * Changes the look this lease draws with. When nobody else shares the material it is changed in
   * place (a colour being dragged makes no new materials and no new shader); when others do, this
   * lease moves to a material of its own and theirs is untouched. Returns whether `material` is
   * now a different object, so the user knows to hand it to its mesh.
   */
  update(next: ResolvedMaterial): boolean;
  /** Lets go. The material (and its texture) is freed with its last user. Safe to call twice. */
  release(): void;
}

export interface MaterialFactoryStats {
  /** Materials alive. */
  materials: number;
  /** Users holding them. */
  leases: number;
  /** Pattern textures alive. */
  textures: number;
  /** Materials ever made: a change that makes none leaves this where it was. */
  created: number;
}

export interface MaterialFactory {
  acquire(look: ResolvedMaterial, options?: AcquireOptions): MaterialLease;
  /** Texture filtering for every pattern texture, now and later. */
  setAnisotropy(anisotropy: number): void;
  stats(): MaterialFactoryStats;
  /** Frees everything. Leases that are left become inert. */
  dispose(): void;
}

interface Entry {
  /** The key it is found under in the shared table; `null` for a material of its own. */
  key: string | null;
  readonly material: MeshStandardMaterial;
  readonly transparent: boolean;
  pattern: MaterialPattern | null;
  readonly leases: Set<Lease>;
}

interface Lease extends MaterialLease {
  entry: Entry;
  active: boolean;
}

/**
 * The one place materials are made (AGENTS rule 6): objects, floors and walls ask for a look and
 * get a material that every other user of the same look shares, with reference counts so nothing
 * is kept that nobody shows. Textures are shared the same way. A tint is applied by changing the
 * material's colour, never by making another material for each step of a slider, so a colour can
 * be dragged without compiling a shader.
 */
export function createMaterialFactory(options: MaterialFactoryOptions = {}): MaterialFactory {
  const textures = createPatternTextures({
    size: options.textureSize ?? 256,
    anisotropy: options.anisotropy ?? 4,
  });
  const shared = new Map<string, Entry>();
  const owned = new Set<Entry>();
  let created = 0;
  let leaseCount = 0;
  let stopped = false;
  const colour = new Color();
  const tint = new Color();

  /** Dresses `entry.material` as `look`. Returns whether the shader it needs changed. */
  function paint(entry: Entry, look: ResolvedMaterial): boolean {
    const { material } = entry;
    colour.set(look.color);
    if (look.tint) colour.multiply(tint.set(look.tint));
    material.color.copy(colour);
    material.roughness = look.roughness;
    material.metalness = look.metalness;
    if (look.pattern === entry.pattern) return false;
    // A texture appearing or going is a different shader: three has to be told.
    if (entry.pattern) textures.release(entry.pattern);
    material.map = look.pattern ? textures.acquire(look.pattern) : null;
    entry.pattern = look.pattern;
    material.needsUpdate = true;
    return true;
  }

  function make(look: ResolvedMaterial, transparent: boolean, key: string | null): Entry {
    const entry: Entry = {
      key,
      material: new MeshStandardMaterial({ transparent }),
      transparent,
      pattern: null,
      leases: new Set(),
    };
    paint(entry, look);
    created += 1;
    if (key === null) owned.add(entry);
    else shared.set(key, entry);
    return entry;
  }

  function free(entry: Entry): void {
    entry.material.dispose();
    if (entry.pattern) textures.release(entry.pattern);
    entry.pattern = null;
    if (entry.key !== null) shared.delete(entry.key);
    else owned.delete(entry);
  }

  function join(lease: Lease, entry: Entry): void {
    lease.entry = entry;
    entry.leases.add(lease);
  }

  function leave(lease: Lease): void {
    const { entry } = lease;
    entry.leases.delete(lease);
    if (entry.leases.size === 0) free(entry);
  }

  function find(look: ResolvedMaterial, transparent: boolean): Entry {
    const key = materialKey(look, transparent);
    return shared.get(key) ?? make(look, transparent, key);
  }

  return {
    acquire(look, acquireOptions = {}) {
      const transparent = acquireOptions.transparent ?? false;
      const entry =
        acquireOptions.shared === false ? make(look, transparent, null) : find(look, transparent);
      const lease: Lease = {
        entry,
        active: true,
        get material() {
          return this.entry.material;
        },
        update(next) {
          if (!this.active || stopped) return false;
          const current = this.entry;
          if (current.key === null) {
            paint(current, next);
            options.onMutate?.();
            return false;
          }
          const key = materialKey(next, current.transparent);
          if (key === current.key) return false;
          if (current.leases.size === 1) {
            const existing = shared.get(key);
            if (existing) {
              // The look it moves to already exists: join it, and the one it leaves goes away.
              leave(this);
              join(this, existing);
              return true;
            }
            shared.delete(current.key);
            paint(current, next);
            current.key = key;
            shared.set(key, current);
            options.onMutate?.();
            return false;
          }
          // Others hold this material: it must not change under them.
          leave(this);
          join(this, find(next, current.transparent));
          return true;
        },
        release() {
          if (!this.active) return;
          this.active = false;
          leaseCount -= 1;
          leave(this);
        },
      };
      leaseCount += 1;
      entry.leases.add(lease);
      return lease;
    },
    setAnisotropy: (anisotropy) => textures.setAnisotropy(anisotropy),
    stats: () => ({
      materials: shared.size + owned.size,
      leases: leaseCount,
      textures: textures.count(),
      created,
    }),
    dispose() {
      stopped = true;
      for (const entry of [...shared.values(), ...owned]) {
        for (const lease of entry.leases) lease.active = false;
        entry.leases.clear();
        free(entry);
      }
      textures.dispose();
      leaseCount = 0;
    },
  };
}
