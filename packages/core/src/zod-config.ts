import { en } from 'zod/locales';
import { z } from 'zod/mini';

/**
 * Core builds its schemas with `zod/mini`: the same parser as classic zod with functions instead
 * of methods, so a bundle keeps only what is used (≈ 20 kB gzip less in the editor, P7-04).
 * Classic zod sets English messages on its own; mini does not, so it is set here, and errors read
 * as before (`Too big: expected number to be <=4`).
 *
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
z.config(en());
z.config({ jitless: true });
