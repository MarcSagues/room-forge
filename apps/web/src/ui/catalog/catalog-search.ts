/** Lowercase and without accents, so that "lamp" finds "Lámpara" and "LAMP" finds "lamp". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The words of a query, folded; an empty query has none and matches everything. */
export function queryWords(query: string): string[] {
  return foldText(query).split(/\s+/).filter(Boolean);
}

/** Every word must appear somewhere in the (already folded) text, in any order. */
export function matchesWords(folded: string, words: readonly string[]): boolean {
  return words.every((word) => folded.includes(word));
}
