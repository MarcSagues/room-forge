import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { LIMITS, type SceneDocument } from '../domain';
import { checkInvariants } from '../session/invariants';
import { arbitraryDocument, buildDocument, buildObject, buildOpening } from '../testing';
import { GOLDEN_CASES } from './migrations/golden';
import { PROJECT_FORMAT } from './project-file';
import {
  compactForShare,
  decodeShareFragment,
  encodeShareFragment,
  fromBase64Url,
  type InflateResult,
  SHARE_LIMITS,
  type ShareCodec,
  type ShareErrorCode,
  toBase64Url,
} from './share-link';

const NO_CATALOG = { getItem: () => undefined };

/**
 * Stores each UTF-16 code unit in two bytes: no compression, but the same contract as the browser
 * codec (bytes in, text out, stops at the cap). The real codec is tested in the web app.
 */
const plainCodec: ShareCodec = {
  async deflate(text) {
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i += 1) {
      bytes[i * 2] = text.charCodeAt(i) >> 8;
      bytes[i * 2 + 1] = text.charCodeAt(i) & 0xff;
    }
    return bytes;
  },
  async inflate(bytes, maxBytes): Promise<InflateResult> {
    if (bytes.length % 2 === 1) return { ok: false, reason: 'corrupt' };
    if (bytes.length / 2 > maxBytes) return { ok: false, reason: 'too-large' };
    let text = '';
    for (let i = 0; i < bytes.length; i += 2) {
      text += String.fromCharCode(((bytes[i] as number) << 8) | (bytes[i + 1] as number));
    }
    return { ok: true, text };
  },
};

const fragmentOf = async (value: unknown) =>
  `v1.${toBase64Url(await plainCodec.deflate(JSON.stringify(value)))}`;

async function codeOf(fragment: string, codec: ShareCodec = plainCodec): Promise<ShareErrorCode> {
  const result = await decodeShareFragment(fragment, codec);
  if (result.ok) throw new Error('expected the link to be refused');
  return result.error.code;
}

/** Ids renamed by first appearance (rooms, openings, objects), as a link may rename them. */
function normalize(document: SceneDocument): unknown {
  const ids = new Map<string, string>();
  for (const id of [
    ...document.roomOrder,
    ...Object.keys(document.openings),
    ...document.objectOrder,
  ]) {
    ids.set(id, `#${ids.size}`);
  }
  const walk = (value: unknown, key?: string): unknown => {
    if (typeof value === 'string' && key && /^(id|roomId|parentId|\d+)$/.test(key)) {
      return ids.get(value) ?? value;
    }
    if (Array.isArray(value)) return value.map((item, index) => walk(item, String(index)));
    if (typeof value === 'object' && value !== null) {
      const isMap = key === 'rooms' || key === 'openings' || key === 'objects';
      const entries = Object.entries(value).map(([k, v]) => [
        isMap ? (ids.get(k) ?? k) : k,
        walk(v, isMap ? undefined : k),
      ]);
      return Object.fromEntries(entries.sort(([a], [b]) => String(a).localeCompare(String(b))));
    }
    return value;
  };
  return walk(document);
}

/** Equal but for numbers, which may differ by the rounding to a thousandth. */
function expectClose(actual: unknown, expected: unknown, path = '') {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(0.0005 + 1e-9);
    return;
  }
  if (typeof expected === 'object' && expected !== null) {
    expect(typeof actual, path).toBe('object');
    const keys = Object.keys(expected);
    expect(Object.keys(actual as object).sort(), path).toEqual([...keys].sort());
    for (const key of keys) {
      expectClose(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
    return;
  }
  expect(actual, path).toBe(expected);
}

/** A busy setup: one room and `count` objects at unrounded positions with long ids. */
function setup(count: number): SceneDocument {
  const base = buildDocument();
  const objects: SceneDocument['objects'] = {};
  const objectOrder: SceneDocument['objectOrder'] = [];
  for (let i = 0; i < count; i += 1) {
    const object = buildObject({
      id: `object-${i}-x8f3k2pq9z`,
      catalogId: ['desk.basic.120', 'chair.office', 'led.strip.1m'][i % 3] as string,
      transform: { position: [0.1 + (i % 6) * 0.61234567, 0, 0.2 + i * 0.0912345], rotationY: i },
      ...(i % 5 === 0
        ? {
            light: {
              on: true,
              color: '#ff00aa',
              intensity: 0.8,
              effect: { kind: 'breathing', speed: 1.5 },
            },
          }
        : {}),
    });
    objects[object.id] = object;
    objectOrder.push(object.id);
  }
  return { ...base, objects, objectOrder };
}

describe('base64url', () => {
  it('round-trips any bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
        const text = toBase64Url(bytes);
        expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
        expect(fromBase64Url(text)).toEqual(bytes);
      }),
    );
  });

  it('refuses characters and lengths base64 cannot have', () => {
    expect(fromBase64Url('ab+/')).toBeNull();
    expect(fromBase64Url('abc=')).toBeNull();
    expect(fromBase64Url('abcde')).toBeNull();
    expect(fromBase64Url('a b')).toBeNull();
  });
});

describe('compactForShare', () => {
  it('renumbers ids and rounds numbers to the millimetre, keeping the name', () => {
    const document = setup(3);
    const compact = compactForShare({ name: 'Studio', document }, { catalog: NO_CATALOG });
    expect(compact.name).toBe('Studio');
    expect(compact.document.roomOrder).toEqual(['0']);
    expect(compact.document.objectOrder).toEqual(['3', '4', '5']);
    expect(Object.keys(compact.document.openings).sort()).toEqual(['1', '2']);
    expect(compact.document.objects['4' as never]?.transform.position).toEqual([0.712, 0, 0.291]);
    expect(checkInvariants(compact.document, NO_CATALOG)).toEqual([]);
  });

  it('renames references to parents and rooms with the ids', () => {
    const compact = compactForShare({ name: 'x', document: buildDocument() });
    const monitor = Object.values(compact.document.objects).find((o) => o.parentId !== null);
    expect(monitor?.parentId).toBe(compact.document.objectOrder[0]);
    expect(monitor?.roomId).toBe('0');
  });

  it('does not round a scene that rounding would break', () => {
    const base = buildDocument();
    const sliver = buildOpening({ id: 'sliver', wall: 'east', kind: 'window', width: 0.0004 });
    const document = { ...base, openings: { ...base.openings, [sliver.id]: sliver } };
    const compact = compactForShare({ name: 'x', document });
    const kept = Object.values(compact.document.openings).find((o) => o.wall === 'east');
    expect(kept?.width).toBe(0.0004);
  });
});

describe('encodeShareFragment / decodeShareFragment', () => {
  it('reproduces the scene: decode(encode(doc)) is the same scene (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDocument().filter((doc) => checkInvariants(doc, NO_CATALOG).length === 0),
        fc.string({ maxLength: LIMITS.maxNameLength }),
        async (document, name) => {
          const encoded = await encodeShareFragment({ name, document }, plainCodec);
          if (!encoded.ok) return; // the plain codec does not compress: a big scene is too long
          const decoded = await decodeShareFragment(`#${encoded.fragment}`, plainCodec);
          expect(decoded.ok).toBe(true);
          if (!decoded.ok) return;
          expect(decoded.value.name).toBe(name);
          expectClose(normalize(decoded.value.document), normalize(document));
        },
      ),
      { numRuns: 60 },
    );
  });

  it('starts with the version, uses only URL-safe characters and says when it is long', async () => {
    const encoded = await encodeShareFragment({ name: 'x', document: setup(2) }, plainCodec);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.fragment).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBe(encoded.fragment.length);
    expect(encoded.overTarget).toBe(encoded.length > SHARE_LIMITS.targetChars);
  });

  it('refuses to make a link over the hard limit', async () => {
    const huge: ShareCodec = { ...plainCodec, deflate: async () => new Uint8Array(13_000) };
    const encoded = await encodeShareFragment({ name: 'x', document: setup(1) }, huge);
    expect(encoded).toEqual({ ok: false, reason: 'too-large', length: 3 + 17_334 });
  });

  it('carries no app version or date, only the scene', async () => {
    const deflate = vi.fn(plainCodec.deflate);
    await encodeShareFragment({ name: 'x', document: setup(1) }, { ...plainCodec, deflate });
    const sent = JSON.parse(deflate.mock.calls[0]?.[0] as string);
    expect(Object.keys(sent).sort()).toEqual(['document', 'format', 'formatVersion', 'project']);
  });

  it('explains an empty, foreign or newer link', async () => {
    expect(await codeOf('')).toBe('EMPTY');
    expect(await codeOf('#')).toBe('EMPTY');
    expect(await codeOf('#section-2')).toBe('NOT_A_PROJECT');
    expect(await codeOf('v0.AAAA')).toBe('NOT_A_PROJECT');
    const newer = await decodeShareFragment('#v2.AAAA', plainCodec);
    expect(newer).toMatchObject({ ok: false, error: { code: 'NEWER_VERSION', found: 2 } });
  });

  it('refuses a long link before decoding or inflating anything', async () => {
    const inflate = vi.fn(plainCodec.inflate);
    const long = `v1.${'A'.repeat(SHARE_LIMITS.maxChars)}`;
    expect(await codeOf(long, { ...plainCodec, inflate })).toBe('TOO_LARGE');
    expect(inflate).not.toHaveBeenCalled();
  });

  it('asks the codec to stop at the inflated-size cap (zip bomb)', async () => {
    const inflate = vi.fn(async (): Promise<InflateResult> => ({ ok: false, reason: 'too-large' }));
    expect(await codeOf('v1.AAAA', { ...plainCodec, inflate })).toBe('TOO_LARGE');
    expect(inflate).toHaveBeenCalledWith(expect.any(Uint8Array), SHARE_LIMITS.maxInflatedBytes);
  });

  it('says a damaged link is damaged', async () => {
    expect(await codeOf('v1.not*base64')).toBe('CORRUPT');
    expect(await codeOf('v1.')).toBe('CORRUPT');
    expect(await codeOf('v1.AA')).toBe('CORRUPT'); // one byte: odd for the plain codec
    const throws: ShareCodec = { ...plainCodec, inflate: () => Promise.reject(new Error('x')) };
    expect(await codeOf('v1.AAAA', throws)).toBe('CORRUPT');
    const unsupported: ShareCodec = {
      ...plainCodec,
      inflate: async () => ({ ok: false, reason: 'unsupported' }),
    };
    expect(await codeOf('v1.AAAA', unsupported)).toBe('UNSUPPORTED');
  });

  it('opens what it inflates like an imported file: JSON, shape, version, schema', async () => {
    const text = (t: string) =>
      `v1.${toBase64Url(new Uint8Array([...t].flatMap((c) => [0, c.charCodeAt(0)])))}`;
    expect(await codeOf(text('{"format":'))).toBe('INVALID_JSON');
    expect(await codeOf(await fragmentOf({ format: 'other' }))).toBe('NOT_A_PROJECT');
    expect(await codeOf(text('{"__proto__":{"x":1}}'))).toBe('HOSTILE_INPUT');
    const newer = await fragmentOf({
      format: PROJECT_FORMAT,
      formatVersion: 2,
      project: { name: 'x' },
      document: buildDocument(),
    });
    expect(await codeOf(newer)).toBe('NEWER_VERSION');
    const invalid = await fragmentOf({
      format: PROJECT_FORMAT,
      formatVersion: 1,
      project: { name: 'x' },
      document: { ...buildDocument(), units: 'ft' },
    });
    expect(await codeOf(invalid)).toBe('INVALID_DOCUMENT');
  });

  it('migrates a link written by an older schema', async () => {
    const golden = GOLDEN_CASES[0];
    if (!golden) throw new Error('no golden case');
    const fragment = await fragmentOf({
      format: PROJECT_FORMAT,
      formatVersion: 1,
      project: { name: 'Old' },
      document: golden.input,
    });
    const decoded = await decodeShareFragment(fragment, plainCodec);
    expect(decoded).toMatchObject({ ok: true, value: { migratedFrom: golden.from } });
  });

  it('never throws on corrupted or hostile fragments (fuzz)', async () => {
    const valid = await encodeShareFragment({ name: 'x', document: setup(4) }, plainCodec);
    if (!valid.ok) throw new Error('setup too large');
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string({ maxLength: 300 }),
          fc.stringMatching(/^v1\.[A-Za-z0-9_-]{0,200}$/),
          fc.nat({ max: valid.fragment.length }).map((n) => valid.fragment.slice(0, n)),
          fc
            .tuple(fc.nat({ max: valid.fragment.length - 1 }), fc.constantFrom('A', '_', '-', 'z'))
            .map(([at, c]) => valid.fragment.slice(0, at) + c + valid.fragment.slice(at + 1)),
        ),
        async (fragment) => {
          const result = await decodeShareFragment(fragment, plainCodec);
          if (!result.ok) expect(typeof result.error.code).toBe('string');
          else expect(checkInvariants(result.value.document, NO_CATALOG)).toEqual([]);
        },
      ),
      { numRuns: 300 },
    );
  });
});
