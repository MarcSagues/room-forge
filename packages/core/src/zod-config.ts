import { z } from 'zod';

/**
 * Zod 4 compiles a faster parser for each object schema with `new Function`, and first probes
 * whether the engine allows it. Under the strict Content-Security-Policy of the app (no
 * `unsafe-eval`, P7-09) the probe is caught but the browser still reports a violation, and the
 * compiled parser could not run anyway. So the interpreted parser is used everywhere: a whole
 * document parses in about 30 µs instead of 20, and documents are only parsed on load, import and
 * command validation, never per frame.
 *
 * Schemas read this when they are created, so this module is imported first by `domain/ids.ts`,
 * which everything that builds a schema depends on.
 */
z.config({ jitless: true });
