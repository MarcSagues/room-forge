import { uniqueProjectName } from '@roomforge/core';

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
export const uniqueName = uniqueProjectName;
