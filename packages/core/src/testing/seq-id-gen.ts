/** Deterministic id generator for tests: `id-1`, `id-2`, ... (the real one is injected in production). */
export function createSeqIdGen(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}
