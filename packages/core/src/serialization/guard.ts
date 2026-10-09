export interface InspectLimits {
  /** Deepest nesting allowed (arrays and objects). */
  maxDepth: number;
  /** Most values (every element, key and primitive counts) allowed. */
  maxNodes: number;
}

export type HostileReason = 'unsafe-key' | 'too-deep' | 'too-many-nodes' | 'cycle';

export interface Hostile {
  reason: HostileReason;
  /** The offending key, for `unsafe-key`. */
  detail?: string;
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Looks at untrusted data before anything interprets it: no key that can poison a prototype, no
 * cycle, nothing deeper or bigger than the limits. Iterative (a hostile 100 000-level array must
 * not overflow the stack) and it stops at the first problem, so cost is bounded by `maxNodes`.
 * Returns null when the data is fine.
 */
export function inspectUntrusted(input: unknown, limits: InspectLimits): Hostile | null {
  if (typeof input !== 'object' || input === null) return null;

  // Objects list their keys up front; arrays are walked by index, because listing the keys of a
  // hostile three-million-element array would cost more than the limit is there to save.
  type Frame = { value: object; keys: string[] | null; length: number; index: number };
  const onPath = new Set<object>();
  const stack: Frame[] = [];
  let nodes = 0;

  const enter = (value: object): Hostile | null => {
    if (onPath.has(value)) return { reason: 'cycle' };
    if (stack.length >= limits.maxDepth) return { reason: 'too-deep' };
    onPath.add(value);
    const keys = Array.isArray(value) ? null : Object.keys(value);
    stack.push({ value, keys, length: keys ? keys.length : (value as unknown[]).length, index: 0 });
    return null;
  };

  const first = enter(input);
  if (first) return first;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1] as Frame;
    if (frame.index >= frame.length) {
      onPath.delete(frame.value);
      stack.pop();
      continue;
    }
    const key = frame.keys ? (frame.keys[frame.index] as string) : null;
    const position = frame.index;
    frame.index += 1;
    nodes += 1;
    if (nodes > limits.maxNodes) return { reason: 'too-many-nodes' };
    if (key !== null && UNSAFE_KEYS.has(key)) return { reason: 'unsafe-key', detail: key };
    const child =
      key === null
        ? (frame.value as unknown[])[position]
        : (frame.value as Record<string, unknown>)[key];
    if (typeof child === 'object' && child !== null) {
      const hostile = enter(child);
      if (hostile) return hostile;
    }
  }
  return null;
}

/** Size of a string once encoded as UTF-8, without allocating the bytes. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4; // a surrogate pair is one 4-byte character
        i += 1;
      } else bytes += 3;
    } else bytes += 3; // the rest of the BMP, and a lone surrogate (encoded as U+FFFD)
  }
  return bytes;
}
