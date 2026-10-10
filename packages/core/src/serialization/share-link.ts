import type { SceneDocument } from '../domain';
import { utf8ByteLength } from './guard';
import {
  type ImportError,
  type ImportErrorCode,
  type ParsedProject,
  type ParseOptions,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  type Project,
  parseProjectFile,
  parseProjectValue,
  type Result,
} from './project-file';

/** Version of the link encoding (deflate-raw + base64url), the `v1.` in `#v1.<payload>`. */
export const SHARE_LINK_VERSION = 1;

/** ADR-0010: links aim under 4 KB, are refused over 16 KB; what they open is capped at 1 MiB. */
export const SHARE_LIMITS = {
  /** Above this the link still works, but the person is told it is long. */
  targetChars: 4096,
  /** The longest fragment made or opened. */
  maxChars: 16_384,
  /** The most bytes a fragment may inflate to: a bigger one is a zip bomb, not a scene. */
  maxInflatedBytes: 1024 * 1024,
} as const;

/**
 * Compression is the platform's (CompressionStream in the browser): core only says what it needs.
 * `inflate` must stop as soon as the output passes `maxBytes`, without producing the rest.
 */
export interface ShareCodec {
  deflate(text: string): Promise<Uint8Array>;
  inflate(bytes: Uint8Array, maxBytes: number): Promise<InflateResult>;
}

export type InflateResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'too-large' | 'corrupt' | 'unsupported' };

/** A link adds three ways to fail to those of a file: empty, damaged, or a browser without codec. */
export type ShareErrorCode = ImportErrorCode | 'EMPTY' | 'CORRUPT' | 'UNSUPPORTED';

export interface ShareError extends Omit<ImportError, 'code'> {
  code: ShareErrorCode;
}

export type ShareEncoding =
  | { ok: true; fragment: string; length: number; overTarget: boolean }
  | { ok: false; reason: 'too-large'; length: number };

const PREFIX = `v${SHARE_LINK_VERSION}.`;

/**
 * The project as a link carries it: ids renumbered (`0`, `1`, …) and every number rounded to the
 * millimetre (a thousandth of a radian for angles), which nobody can see but halves the link. If
 * rounding would break a rule of the scene (an opening that fit to the micron), it is not rounded.
 */
export function compactForShare(project: Project, options: ParseOptions = {}): Project {
  const renamed = renumberIds(project.document);
  const rounded = roundNumbers(renamed) as SceneDocument;
  const check = parseProjectValue(envelope({ name: project.name, document: rounded }), options);
  return { name: project.name, document: check.ok ? rounded : renamed };
}

/** The fragment (without `#`) that opens a copy of the project in the viewer. */
export async function encodeShareFragment(
  project: Project,
  codec: ShareCodec,
  options: ParseOptions = {},
): Promise<ShareEncoding> {
  const text = JSON.stringify(envelope(compactForShare(project, options)));
  // A scene this big could not be opened again: refuse it here rather than make a dead link.
  if (utf8ByteLength(text) > SHARE_LIMITS.maxInflatedBytes) {
    return { ok: false, reason: 'too-large', length: Number.POSITIVE_INFINITY };
  }
  const fragment = PREFIX + toBase64Url(await codec.deflate(text));
  const length = fragment.length;
  if (length > SHARE_LIMITS.maxChars) return { ok: false, reason: 'too-large', length };
  return { ok: true, fragment, length, overTarget: length > SHARE_LIMITS.targetChars };
}

const fail = (
  code: ShareErrorCode,
  message: string,
  extra: Partial<Pick<ShareError, 'found' | 'supported'>> = {},
): Result<never, ShareError> => ({ ok: false, error: { code, message, details: [], ...extra } });

/**
 * Opens a link's fragment. Untrusted input, so it never throws and checks in order: length (before
 * decoding anything), version, alphabet, inflated size (the codec stops at the cap), then the same
 * path as an imported file (JSON, hostile shapes, envelope, migrations, schema, invariants).
 */
export async function decodeShareFragment(
  fragment: string,
  codec: ShareCodec,
  options: Omit<ParseOptions, 'maxBytes'> = {},
): Promise<Result<ParsedProject, ShareError>> {
  if (typeof fragment !== 'string') return fail('EMPTY', 'The link has no scene');
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (raw === '') return fail('EMPTY', 'The link has no scene');
  if (raw.length > SHARE_LIMITS.maxChars) return fail('TOO_LARGE', 'The link is too long');

  const version = /^v(\d{1,6})\./.exec(raw);
  if (!version) return fail('NOT_A_PROJECT', 'This is not a RoomForge link');
  const found = Number(version[1]);
  if (found > SHARE_LINK_VERSION) {
    return fail('NEWER_VERSION', 'The link is from a newer version of RoomForge', {
      found,
      supported: SHARE_LINK_VERSION,
    });
  }
  if (found !== SHARE_LINK_VERSION) return fail('NOT_A_PROJECT', 'This is not a RoomForge link');

  const bytes = fromBase64Url(raw.slice(version[0].length));
  if (!bytes || bytes.length === 0) return fail('CORRUPT', 'The link is damaged');

  let inflated: InflateResult;
  try {
    inflated = await codec.inflate(bytes, SHARE_LIMITS.maxInflatedBytes);
  } catch {
    inflated = { ok: false, reason: 'corrupt' };
  }
  if (!inflated.ok) {
    if (inflated.reason === 'too-large') return fail('TOO_LARGE', 'The link holds too much');
    if (inflated.reason === 'unsupported') {
      return fail('UNSUPPORTED', 'This browser cannot open links');
    }
    return fail('CORRUPT', 'The link is damaged');
  }
  return parseProjectFile(inflated.text, { ...options, maxBytes: SHARE_LIMITS.maxInflatedBytes });
}

/** The project file envelope without the app version and date: a link carries only the scene. */
function envelope(project: Project) {
  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    project: { name: project.name },
    document: project.document,
  };
}

/** Every id replaced by its position in base 36: rooms, then openings, then objects. */
function renumberIds(document: SceneDocument): SceneDocument {
  const ids = new Map<string, string>();
  for (const id of [
    ...document.roomOrder,
    ...Object.keys(document.openings),
    ...document.objectOrder,
  ]) {
    if (!ids.has(id)) ids.set(id, ids.size.toString(36));
  }
  // Every id is in the map for a valid document; the fallback keeps an odd one as it was.
  const to = <T extends string>(id: T) => (ids.get(id) ?? id) as T;
  const rekey = <T extends { id: string }>(map: Readonly<Record<string, T>>, edit: (e: T) => T) =>
    Object.fromEntries(Object.values(map).map((entity) => [to(entity.id), edit(entity)]));

  return {
    ...document,
    rooms: rekey(document.rooms, (room) => ({ ...room, id: to(room.id) })),
    roomOrder: document.roomOrder.map(to),
    openings: rekey(document.openings, (opening) => ({
      ...opening,
      id: to(opening.id),
      roomId: to(opening.roomId),
    })),
    objects: rekey(document.objects, (object) => ({
      ...object,
      id: to(object.id),
      roomId: to(object.roomId),
      parentId: object.parentId === null ? null : to(object.parentId),
    })),
    objectOrder: document.objectOrder.map(to),
  } as SceneDocument;
}

/** A copy with every number rounded to three decimals (and -0 written as 0). */
function roundNumbers(value: unknown): unknown {
  if (typeof value === 'number') {
    const rounded = Math.round(value * 1000) / 1000;
    if (!Number.isFinite(rounded)) return value;
    return rounded === 0 ? 0 : rounded;
  }
  if (Array.isArray(value)) return value.map(roundNumbers);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundNumbers(v)]));
  }
  return value;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUES = new Map([...ALPHABET].map((char, index) => [char, index]));

/** RFC 4648 §5 without padding: safe in a URL fragment as it is. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    if (b !== undefined) out += ALPHABET[(n >> 6) & 63];
    if (c !== undefined) out += ALPHABET[n & 63];
  }
  return out;
}

/** The bytes of a base64url string, or null if it has a character or length base64 cannot have. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let at = 0;
  for (const char of text) {
    const value = VALUES.get(char);
    if (value === undefined) return null;
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at] = (buffer >> bits) & 0xff;
      at += 1;
    }
  }
  return bytes;
}
