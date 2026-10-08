// Negative fixture: this file MUST NOT compile under packages/core's tsconfig
// (no "dom" lib). scripts/check-no-dom.mjs asserts that tsc rejects it.
// It is excluded from tsconfig.json and only included by tsconfig.negative.json.
export const width: number = window.innerWidth;
export const title: string = document.title;
