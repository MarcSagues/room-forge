import { createNanoIdGen, type SceneDocument } from '@roomforge/core';
import { buildDocument, buildObject } from '@roomforge/core/testing';
import { describe, expect, it } from 'vitest';
import { browserShareCodec, createShareLink, openShareLink, VIEW_PATH } from './share-link';

const ORIGIN = 'https://roomforge.example';

/** A gaming setup as people make them: 30 objects with real ids, some lit, placed by hand. */
function setupOf30(): SceneDocument {
  const base = buildDocument();
  const id = createNanoIdGen();
  const catalog = ['desk.basic.120', 'chair.office', 'led.strip.1m', 'shelf.wall'];
  const objects: SceneDocument['objects'] = {};
  const objectOrder: SceneDocument['objectOrder'] = [];
  for (let i = 0; i < 30; i += 1) {
    const object = buildObject({
      id: id(),
      catalogId: catalog[i % catalog.length] as string,
      transform: {
        position: [0.3 + (i % 6) * 0.5713, 0, 0.25 + Math.floor(i / 6) * 0.5179],
        rotationY: (i * Math.PI) / 7,
      },
      ...(i % 3 === 0 ? { materials: { top: { presetId: 'wood.oak', tint: '#a0522d' } } } : {}),
      ...(i % 4 === 0
        ? {
            light: {
              on: true,
              color: '#ff00aa',
              intensity: 0.8,
              effect: { kind: 'cycle', speed: 1.5 },
            },
          }
        : {}),
    });
    objects[object.id] = object;
    objectOrder.push(object.id);
  }
  return { ...base, objects, objectOrder };
}

async function deflate(text: string) {
  return browserShareCodec.deflate(text);
}

describe('browserShareCodec', () => {
  it('round-trips text, including characters outside ASCII', async () => {
    const text = '{"name":"Habitación 🎮 ñ"}';
    const inflated = await browserShareCodec.inflate(await deflate(text), 1000);
    expect(inflated).toEqual({ ok: true, text });
  });

  it('stops inflating past the cap (zip bomb)', async () => {
    const bomb = await deflate('0'.repeat(4 * 1024 * 1024));
    expect(bomb.byteLength).toBeLessThan(16 * 1024);
    expect(await browserShareCodec.inflate(bomb, 1024 * 1024)).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('calls a truncated or tampered stream corrupt', async () => {
    const bytes = await deflate('{"a":"some text that is long enough to be truncated"}');
    expect(await browserShareCodec.inflate(bytes.slice(0, bytes.length - 4), 1000)).toEqual({
      ok: false,
      reason: 'corrupt',
    });
    expect(await browserShareCodec.inflate(new Uint8Array([0xff, 0xfe, 0xfd]), 1000)).toEqual({
      ok: false,
      reason: 'corrupt',
    });
    const badUtf8 = await (async () => {
      const stream = new CompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      writer.write(new Uint8Array([0xc3, 0x28])).catch(() => {});
      writer.close().catch(() => {});
      return new Uint8Array(await new Response(stream.readable).arrayBuffer());
    })();
    expect(await browserShareCodec.inflate(badUtf8, 1000)).toEqual({
      ok: false,
      reason: 'corrupt',
    });
  });
});

describe('share links', () => {
  it('a 30-object setup makes a link under 4 KB that opens the same scene', async () => {
    const document = setupOf30();
    const link = await createShareLink({ name: 'Setup', document }, { origin: ORIGIN });
    if (!link.ok) throw new Error(`no link: ${link.reason}`);
    expect(link.url.startsWith(`${ORIGIN}${VIEW_PATH}#v1.`)).toBe(true);
    expect(link.length).toBeLessThan(4096);
    expect(link.overTarget).toBe(false);

    const opened = await openShareLink(new URL(link.url).hash);
    if (!opened.ok) throw new Error(`not opened: ${opened.error.code}`);
    expect(opened.value.name).toBe('Setup');
    expect(opened.value.document.objectOrder).toHaveLength(30);
    const before = document.objectOrder.map((id) => document.objects[id]);
    const after = opened.value.document.objectOrder.map((id) => opened.value.document.objects[id]);
    after.forEach((object, i) => {
      const original = before[i];
      expect(object?.catalogId).toBe(original?.catalogId);
      expect(object?.light).toEqual(original?.light);
      object?.transform.position.forEach((value, axis) => {
        // Rounded to the millimetre.
        const error = Math.abs(value - (original?.transform.position[axis] as number));
        expect(error).toBeLessThanOrEqual(0.0005 + 1e-9);
      });
    });
  });

  it('opens a link whose fragment was cut short with an error, not a crash', async () => {
    const link = await createShareLink(
      { name: 'Setup', document: setupOf30() },
      { origin: ORIGIN },
    );
    if (!link.ok) throw new Error('no link');
    const hash = new URL(link.url).hash;
    const cut = await openShareLink(hash.slice(0, Math.floor(hash.length / 2)));
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(['CORRUPT', 'INVALID_JSON']).toContain(cut.error.code);
  });
});
