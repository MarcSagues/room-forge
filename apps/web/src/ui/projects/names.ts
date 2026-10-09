/** Lowercase and without accents, so that “cocina” finds “Cócina”. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Whether a project name matches what was typed in the search box (a plain substring). */
export function matchesQuery(name: string, query: string): boolean {
  const wanted = fold(query);
  return wanted === '' || fold(name).includes(wanted);
}

/** `base`, or `base 2`, `base 3`… the first one that no name in `taken` already has. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((name) => name.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
