import {
  type CatalogProvider,
  decodeShareFragment,
  encodeShareFragment,
  type InflateResult,
  type ParsedProject,
  type Project,
  type Result,
  type ShareCodec,
  type ShareError,
} from '@roomforge/core';

/** Where a shared link opens (ADR-0010): the scene travels in the fragment, never to a server. */
export const VIEW_PATH = '/view/';

const FORMAT = 'deflate-raw';

function supported(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/** Feeds `bytes` to a transform and reads what comes out, stopping (and cancelling) past `max`. */
async function pipe(
  stream: CompressionStream | DecompressionStream,
  bytes: Uint8Array,
  max = Number.POSITIVE_INFINITY,
): Promise<Uint8Array | 'too-large'> {
  const writer = stream.writable.getWriter();
  // Not awaited: the output has to be read while it is written, or a large input stalls.
  writer.write(new Uint8Array(bytes)).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return 'too-large';
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/** The browser's own deflate (no dependency): `CompressionStream('deflate-raw')`. */
export const browserShareCodec: ShareCodec = {
  async deflate(text) {
    const out = await pipe(new CompressionStream(FORMAT), new TextEncoder().encode(text));
    if (out === 'too-large') throw new Error('unreachable: no limit when compressing');
    return out;
  },
  async inflate(bytes, maxBytes): Promise<InflateResult> {
    if (!supported()) return { ok: false, reason: 'unsupported' };
    try {
      const out = await pipe(new DecompressionStream(FORMAT), bytes, maxBytes);
      if (out === 'too-large') return { ok: false, reason: 'too-large' };
      return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(out) };
    } catch {
      // A truncated or tampered stream errors in the decompressor; bad UTF-8 in the decoder.
      return { ok: false, reason: 'corrupt' };
    }
  },
};

export type ShareLink =
  | { ok: true; url: string; length: number; overTarget: boolean }
  | { ok: false; reason: 'too-large' | 'unsupported'; length?: number };

/** The link that opens a read-only copy of the project: `<origin>/view/#v1.<payload>`. */
export async function createShareLink(
  project: Project,
  options: { origin: string; catalog?: CatalogProvider; codec?: ShareCodec },
): Promise<ShareLink> {
  const codec = options.codec ?? browserShareCodec;
  if (codec === browserShareCodec && !supported()) return { ok: false, reason: 'unsupported' };
  const encoded = await encodeShareFragment(
    project,
    codec,
    options.catalog ? { catalog: options.catalog } : {},
  );
  if (!encoded.ok) return { ok: false, reason: 'too-large', length: encoded.length };
  const url = `${options.origin}${VIEW_PATH}#${encoded.fragment}`;
  return { ok: true, url, length: url.length, overTarget: encoded.overTarget };
}

/** Opens the scene of a link (`location.hash`): untrusted, see `decodeShareFragment`. */
export function openShareLink(
  hash: string,
  options: { catalog?: CatalogProvider; codec?: ShareCodec } = {},
): Promise<Result<ParsedProject, ShareError>> {
  return decodeShareFragment(
    hash,
    options.codec ?? browserShareCodec,
    options.catalog ? { catalog: options.catalog } : {},
  );
}
