// The design tokens must keep WCAG contrast and match what DESIGN_SYSTEM.md documents.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrastRatio, parseDocumentedRatios, parseThemes } from './contrast.mjs';

const themes = parseThemes();
const ratio = (theme, fg, bg) => contrastRatio(themes[theme][fg], themes[theme][bg]);

test('contrastRatio matches known WCAG values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrastRatio('#777777', '#ffffff').toFixed(2), '4.48');
});

test('both themes define the same tokens', () => {
  assert.deepEqual(Object.keys(themes.dark).sort(), Object.keys(themes.light).sort());
});

// [foreground, background, minimum ratio, why]
const REQUIRED = [
  ...['bg-canvas', 'bg-surface', 'bg-elevated', 'bg-hover'].flatMap((bg) => [
    ['text-primary', bg, 4.5, 'body text (WCAG 1.4.3)'],
    ['text-secondary', bg, 4.5, 'secondary text'],
  ]),
  ...['bg-canvas', 'bg-surface', 'bg-elevated'].map((bg) => [
    'text-tertiary',
    bg,
    4.5,
    'placeholders and metadata',
  ]),
  ['accent', 'bg-surface', 4.5, 'accent text/icons on panels'],
  ['accent', 'bg-canvas', 3, 'focus ring and selection (WCAG 1.4.11)'],
  ['accent-fg', 'accent', 4.5, 'text on primary buttons'],
  ['accent-fg', 'accent-hover', 4.5, 'text on hovered primary buttons'],
  ['danger-fg', 'danger', 4.5, 'text on destructive buttons'],
  ['border-control', 'bg-surface', 3, 'input/button boundaries (WCAG 1.4.11)'],
  ['border-control', 'bg-elevated', 3, 'input/button boundaries'],
  ['border-control', 'bg-canvas', 3, 'input/button boundaries'],
  ...['success', 'warning', 'danger', 'info'].map((s) => [s, 'bg-surface', 4.5, 'status text']),
];

for (const theme of ['dark', 'light']) {
  for (const [fg, bg, min, why] of REQUIRED) {
    test(`${theme}: ${fg} on ${bg} >= ${min} (${why})`, () => {
      const r = ratio(theme, fg, bg);
      assert.ok(r >= min, `${r.toFixed(2)} < ${min}`);
    });
  }
}

test('every documented contrast ratio is met or exceeded by the implemented tokens', () => {
  const documented = parseDocumentedRatios();
  assert.ok(documented.length >= 6, 'expected the DESIGN_SYSTEM §2.1 contrast table to be found');
  for (const row of documented) {
    for (const theme of ['dark', 'light']) {
      const actual = ratio(theme, row.fg, row.bg);
      assert.ok(
        actual >= row[theme] - 0.05,
        `${theme} ${row.fg}/${row.bg}: implemented ${actual.toFixed(2)} < documented ${row[theme]}`,
      );
    }
  }
});
