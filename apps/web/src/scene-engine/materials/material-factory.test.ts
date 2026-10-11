import { type HexColor, resolveMaterial } from '@roomforge/core';
import { Color, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createMaterialFactory } from './material-factory';

const look = (
  presetId: string,
  extra: { tint?: HexColor; roughness?: number; metalness?: number } = {},
) => resolveMaterial({ presetId, ...extra });

const disposals = (target: { addEventListener(type: 'dispose', listener: () => void): void }) => {
  const count = { value: 0 };
  target.addEventListener('dispose', () => {
    count.value += 1;
  });
  return count;
};

describe('MaterialFactory: sharing', () => {
  it('gives 50 users of the same look one material (not 50)', () => {
    const factory = createMaterialFactory();
    const leases = Array.from({ length: 50 }, () => factory.acquire(look('paint.matte')));
    expect(new Set(leases.map((lease) => lease.material)).size).toBe(1);
    expect(factory.stats()).toMatchObject({ materials: 1, leases: 50 });
  });

  it('gives different looks different materials, and the same look the same one again', () => {
    const factory = createMaterialFactory();
    const a = factory.acquire(look('paint.matte'));
    const b = factory.acquire(look('paint.navy'));
    const c = factory.acquire(look('paint.matte', { tint: '#ff0000' }));
    const again = factory.acquire(look('paint.navy'));
    expect(new Set([a.material, b.material, c.material]).size).toBe(3);
    expect(again.material).toBe(b.material);
    expect(factory.stats().materials).toBe(3);
  });

  it('draws every preset this version does not know with the default material, shared', () => {
    const factory = createMaterialFactory();
    const unknown = factory.acquire(look('from.the.future'));
    const other = factory.acquire(look('also.unknown'));
    const matte = factory.acquire(look('paint.matte'));
    expect(unknown.material).toBe(other.material);
    expect(unknown.material).toBe(matte.material);
  });

  it('sets the material from the look: colour times tint, roughness, metalness', () => {
    const factory = createMaterialFactory();
    const steel = factory.acquire(look('metal.steel')).material;
    expect(steel.roughness).toBeCloseTo(0.4);
    expect(steel.metalness).toBeCloseTo(1);
    const plain = factory.acquire(look('paint.matte')).material.color;
    const tinted = factory.acquire(look('paint.matte', { tint: '#808080' })).material.color;
    // A tint multiplies the colour: mid-grey halves it (in the renderer's linear space).
    const grey = new Color('#808080');
    expect(tinted.r).toBeCloseTo(plain.r * grey.r, 5);
    expect(tinted.g).toBeCloseTo(plain.g * grey.g, 5);
    expect(tinted.b).toBeCloseTo(plain.b * grey.b, 5);
  });

  it('keeps see-through and opaque materials apart, even for the same look', () => {
    const factory = createMaterialFactory();
    const opaque = factory.acquire(look('paint.matte')).material;
    const glass = factory.acquire(look('paint.matte'), { transparent: true }).material;
    expect(glass).not.toBe(opaque);
    expect(glass.transparent).toBe(true);
    expect(opaque.transparent).toBe(false);
  });
});

describe('MaterialFactory: counting who uses what', () => {
  it('frees a material when its last user lets go, and not before', () => {
    const factory = createMaterialFactory();
    const a = factory.acquire(look('wood.oak'));
    const b = factory.acquire(look('wood.oak'));
    const freed = disposals(a.material);
    a.release();
    expect(freed.value).toBe(0);
    expect(factory.stats().materials).toBe(1);
    b.release();
    expect(freed.value).toBe(1);
    expect(factory.stats()).toMatchObject({ materials: 0, leases: 0, textures: 0 });
  });

  it('letting go twice is the same as once', () => {
    const factory = createMaterialFactory();
    const a = factory.acquire(look('paint.matte'));
    const b = factory.acquire(look('paint.matte'));
    a.release();
    a.release();
    expect(factory.stats()).toMatchObject({ materials: 1, leases: 1 });
    b.release();
    expect(factory.stats().materials).toBe(0);
  });

  it('makes a new material when the same look is wanted again after everyone let go', () => {
    const factory = createMaterialFactory();
    const first = factory.acquire(look('paint.matte'));
    const material = first.material;
    first.release();
    const second = factory.acquire(look('paint.matte'));
    expect(second.material).not.toBe(material);
  });
});

describe('MaterialFactory: textures', () => {
  it('draws patterned presets with a shared texture, one per pattern', () => {
    const factory = createMaterialFactory();
    const oak = factory.acquire(look('floor.oak')).material;
    const grey = factory.acquire(look('floor.grey')).material; // planks too
    const walnut = factory.acquire(look('wood.walnut')).material; // wood grain
    expect(oak.map).toBeTruthy();
    expect(oak.map).toBe(grey.map);
    expect(walnut.map).not.toBe(oak.map);
    expect(factory.stats().textures).toBe(2);
  });

  it('gives plain paints no texture at all', () => {
    const factory = createMaterialFactory();
    expect(factory.acquire(look('paint.matte')).material.map).toBeNull();
    expect(factory.stats().textures).toBe(0);
  });

  it('frees a texture when the last material that shows it goes', () => {
    const factory = createMaterialFactory();
    const a = factory.acquire(look('floor.oak'));
    const b = factory.acquire(look('floor.grey'));
    const texture = a.material.map;
    if (!texture) throw new Error('no texture');
    const freed = disposals(texture);
    a.release();
    expect(freed.value).toBe(0);
    b.release();
    expect(freed.value).toBe(1);
    expect(factory.stats().textures).toBe(0);
  });

  it('textures are colour data that repeats every metre, with mipmaps', () => {
    const factory = createMaterialFactory({ anisotropy: 8 });
    const texture = factory.acquire(look('floor.oak')).material.map;
    expect(texture?.colorSpace).toBe(SRGBColorSpace);
    expect(texture?.wrapS).toBe(RepeatWrapping);
    expect(texture?.wrapT).toBe(RepeatWrapping);
    expect(texture?.generateMipmaps).toBe(true);
    expect(texture?.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture?.anisotropy).toBe(8);
    expect(texture?.repeat.toArray()).toEqual([1, 1]);
  });

  it('changes the filtering of every texture it has when the quality changes', () => {
    const factory = createMaterialFactory({ anisotropy: 2 });
    const oak = factory.acquire(look('floor.oak')).material.map;
    const walnut = factory.acquire(look('wood.walnut')).material.map;
    factory.setAnisotropy(16);
    expect(oak?.anisotropy).toBe(16);
    expect(walnut?.anisotropy).toBe(16);
    // ...and a texture made afterwards starts at the new value.
    expect(factory.acquire(look('panel.slats')).material.map?.anisotropy).toBe(16);
  });

  it('draws pictures of the size asked for', () => {
    const factory = createMaterialFactory({ textureSize: 64 });
    const image = factory.acquire(look('floor.oak')).material.map?.image as
      | { width: number; height: number }
      | undefined;
    expect(image?.width).toBe(64);
    expect(image?.height).toBe(64);
  });
});

describe('MaterialFactory: changing a look (a colour being dragged)', () => {
  it('changes the material in place when nobody else uses it: no new material per step', () => {
    const onMutate = vi.fn();
    const factory = createMaterialFactory({ onMutate });
    const lease = factory.acquire(look('paint.matte'));
    const material = lease.material;
    const created = factory.stats().created;
    for (let step = 0; step < 100; step += 1) {
      const moved = lease.update(
        look('paint.matte', { tint: `#${(step * 2 + 16).toString(16).padStart(2, '0')}80ff` }),
      );
      expect(moved).toBe(false);
      expect(lease.material).toBe(material);
    }
    expect(factory.stats().created).toBe(created);
    expect(factory.stats().materials).toBe(1);
    expect(onMutate).toHaveBeenCalledTimes(100);
    expect(material.color.getHexString()).not.toBe(look('paint.matte').color.slice(1));
  });

  it('does not recompile the shader for a colour or surface change (the material is not flagged)', () => {
    const factory = createMaterialFactory();
    const lease = factory.acquire(look('paint.matte'));
    const version = lease.material.version;
    lease.update(look('paint.matte', { tint: '#ff8800' }));
    lease.update(look('paint.matte', { tint: '#ff8800', roughness: 0.2, metalness: 0.5 }));
    expect(lease.material.version).toBe(version);
  });

  it('does flag it when the texture appears or goes: that is a different shader', () => {
    const factory = createMaterialFactory();
    const lease = factory.acquire(look('paint.matte'));
    const before = lease.material.version;
    lease.update(look('floor.oak'));
    expect(lease.material.map).toBeTruthy();
    expect(lease.material.version).toBeGreaterThan(before);
    expect(factory.stats().textures).toBe(1);
    lease.update(look('paint.matte'));
    expect(lease.material.map).toBeNull();
    expect(factory.stats().textures).toBe(0);
  });

  it('forks when others share the material: the others are not touched', () => {
    const factory = createMaterialFactory();
    const crowd = Array.from({ length: 49 }, () => factory.acquire(look('paint.matte')));
    const mine = factory.acquire(look('paint.matte'));
    const shared = mine.material;
    const colourBefore = shared.color.getHex();
    const moved = mine.update(look('paint.matte', { tint: '#ff0000' }));
    expect(moved).toBe(true);
    expect(mine.material).not.toBe(shared);
    expect(shared.color.getHex()).toBe(colourBefore);
    expect(crowd.every((lease) => lease.material === shared)).toBe(true);
    expect(factory.stats().materials).toBe(2);
  });

  it('keeps the shader program: a tint on one of 50 objects adds no program', () => {
    // Programs are keyed by what the shader needs (a map or not, transparency...), not by colour.
    const factory = createMaterialFactory();
    const crowd = Array.from({ length: 50 }, () => factory.acquire(look('paint.matte')));
    const shaderNeeds = (m: (typeof crowd)[number]['material']) => [
      m.map === null,
      m.transparent,
      m.type,
    ];
    const before = shaderNeeds(crowd[0]?.material as never);
    crowd[0]?.update(look('paint.matte', { tint: '#00ff00' }));
    expect(shaderNeeds(crowd[0]?.material as never)).toEqual(before);
  });

  it('joins the material that already has the look it moves to, and frees the one it leaves', () => {
    const factory = createMaterialFactory();
    const navy = factory.acquire(look('paint.navy'));
    const mine = factory.acquire(look('paint.matte'));
    const left = mine.material;
    const freed = disposals(left);
    expect(mine.update(look('paint.navy'))).toBe(true);
    expect(mine.material).toBe(navy.material);
    expect(freed.value).toBe(1);
    expect(factory.stats()).toMatchObject({ materials: 1, leases: 2 });
  });

  it('after a change, the old look can be used again by someone else without surprises', () => {
    const factory = createMaterialFactory();
    const lease = factory.acquire(look('paint.matte'));
    lease.update(look('paint.navy'));
    const other = factory.acquire(look('paint.matte'));
    expect(other.material.color.getHex()).toBe(new Color('#f1efe9').getHex());
    expect(lease.material).not.toBe(other.material);
  });
});

describe('MaterialFactory: materials of their own (walls fade one by one)', () => {
  it('gives each user its own material, with a shared texture', () => {
    const factory = createMaterialFactory();
    const walls = Array.from({ length: 4 }, () =>
      factory.acquire(look('panel.slats'), { transparent: true, shared: false }),
    );
    expect(new Set(walls.map((wall) => wall.material)).size).toBe(4);
    expect(new Set(walls.map((wall) => wall.material.map)).size).toBe(1);
    expect(factory.stats()).toMatchObject({ materials: 4, textures: 1 });
  });

  it('what one wall does to its material does not reach the others', () => {
    const factory = createMaterialFactory();
    const [a, b] = [0, 1].map(() =>
      factory.acquire(look('paint.matte'), { transparent: true, shared: false }),
    );
    if (!a || !b) throw new Error('no leases');
    a.material.opacity = 0.2;
    expect(b.material.opacity).toBe(1);
  });

  it('frees only its own material when it goes, and the texture with the last one', () => {
    const factory = createMaterialFactory();
    const a = factory.acquire(look('panel.slats'), { shared: false });
    const b = factory.acquire(look('panel.slats'), { shared: false });
    const texture = a.material.map;
    const freed = disposals(texture as never);
    const own = disposals(a.material);
    a.release();
    expect(own.value).toBe(1);
    expect(freed.value).toBe(0);
    b.release();
    expect(freed.value).toBe(1);
  });

  it('changes in place, always: nobody else could be sharing it', () => {
    const factory = createMaterialFactory();
    const a = factory.acquire(look('paint.matte'), { transparent: true, shared: false });
    factory.acquire(look('paint.matte'), { transparent: true, shared: false });
    const material = a.material;
    expect(a.update(look('paint.navy'))).toBe(false);
    expect(a.material).toBe(material);
  });
});

describe('MaterialFactory: glowing materials (luminaires)', () => {
  it('glows in its own colour, untouched by tone mapping, and is shared like any other', () => {
    const factory = createMaterialFactory();
    const leases = Array.from({ length: 6 }, () =>
      factory.acquire(look('paint.satin', { tint: '#ff3d9a' }), { emissive: true }),
    );
    const [first] = leases;
    if (!first) throw new Error('no lease');
    const { material } = first;
    expect(new Set(leases.map((lease) => lease.material)).size).toBe(1);
    expect(material.emissive.getHex()).toBe(material.color.getHex());
    expect(material.emissive.getHex()).not.toBe(0);
    expect(material.toneMapped).toBe(false);
    const matte = factory.acquire(look('paint.satin', { tint: '#ff3d9a' })).material;
    expect(matte).not.toBe(material);
    expect(matte.emissive.getHex()).toBe(0);
    expect(matte.toneMapped).toBe(true);
  });

  it('keeps glowing in the new colour when its look changes', () => {
    const factory = createMaterialFactory();
    const lease = factory.acquire(look('paint.satin', { tint: '#ff0000' }), { emissive: true });
    expect(lease.update(look('paint.satin', { tint: '#00ff00' }))).toBe(false);
    expect(lease.material.emissive.getHex()).toBe(lease.material.color.getHex());
    expect(lease.material.toneMapped).toBe(false);
    expect(factory.stats().created).toBe(1);
  });
});

describe('MaterialFactory: glow colours (luminaire light state)', () => {
  const glowing = (glow: string) => ({ ...look('paint.satin', { tint: '#ffffff' }), glow });

  it('glows in the given colour, black when off, and shares one material per colour', () => {
    const factory = createMaterialFactory();
    const red = factory.acquire(glowing('#ff0000'), { emissive: true });
    const red2 = factory.acquire(glowing('#FF0000'), { emissive: true });
    const off = factory.acquire(glowing('#000000'), { emissive: true });
    expect(red.material).toBe(red2.material);
    expect(red.material.emissive.getHex()).toBe(0xff0000);
    expect(off.material).not.toBe(red.material);
    expect(off.material.emissive.getHex()).toBe(0);
    expect(off.material.toneMapped).toBe(false);
  });

  it('changes a glow in place when it is the only user, and never touches the shader', () => {
    const factory = createMaterialFactory();
    const lease = factory.acquire(glowing('#ff0000'), { emissive: true });
    const { material } = lease;
    const version = material.version;
    expect(lease.update(glowing('#000000'))).toBe(false);
    expect(lease.material).toBe(material);
    expect(material.emissive.getHex()).toBe(0);
    expect(material.version).toBe(version); // no needsUpdate: same program
  });

  it('moves a shared lease to its own glow, leaving the others lit', () => {
    const factory = createMaterialFactory();
    const a = factory.acquire(glowing('#ff0000'), { emissive: true });
    const b = factory.acquire(glowing('#ff0000'), { emissive: true });
    expect(a.update(glowing('#000000'))).toBe(true);
    expect(a.material).not.toBe(b.material);
    expect(b.material.emissive.getHex()).toBe(0xff0000);
  });
});

describe('MaterialFactory: stopping', () => {
  it('dispose frees everything, and what leases are left do nothing', () => {
    const factory = createMaterialFactory();
    const a = factory.acquire(look('floor.oak'));
    const b = factory.acquire(look('paint.navy'), { shared: false });
    const material = a.material;
    const freed = disposals(material);
    factory.dispose();
    expect(freed.value).toBe(1);
    expect(factory.stats()).toMatchObject({ materials: 0, textures: 0, leases: 0 });
    expect(() => a.release()).not.toThrow();
    expect(() => b.update(look('paint.matte'))).not.toThrow();
  });
});
