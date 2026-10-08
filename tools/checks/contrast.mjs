// WCAG contrast helpers for the design tokens (docs/DESIGN_SYSTEM.md §2.1).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TOKENS_FILE = path.join(root, 'apps/web/src/ui/tokens.css');
export const DESIGN_SYSTEM_FILE = path.join(root, 'docs/DESIGN_SYSTEM.md');

const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Extract `--token: #hex;` declarations of the dark and light blocks of tokens.css. */
export function parseThemes(css = readFileSync(TOKENS_FILE, 'utf8')) {
  const block = (theme) => {
    // Tolerant to quote style and whitespace (Biome reformats the CSS).
    const selector = new RegExp(`:root\\[data-theme=["']${theme}["']\\]\\s*\\{([^}]*)\\}`);
    const match = selector.exec(css);
    if (!match) throw new Error(`theme block not found: ${theme}`);
    const tokens = {};
    for (const m of match[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      tokens[m[1]] = m[2].toLowerCase();
    }
    return tokens;
  };
  return { dark: block('dark'), light: block('light') };
}

/** Rows like "| `text-primary` / `bg-surface` | 15,3 | 18,3 |" from the DESIGN_SYSTEM contrast table. */
export function parseDocumentedRatios(md = readFileSync(DESIGN_SYSTEM_FILE, 'utf8')) {
  const rows = [];
  for (const m of md.matchAll(/^\| `([\w-]+)` \/ `([\w-]+)` \| ([\d,]+) \| ([\d,]+) \|$/gm)) {
    rows.push({
      fg: m[1],
      bg: m[2],
      dark: Number(m[3].replace(',', '.')),
      light: Number(m[4].replace(',', '.')),
    });
  }
  return rows;
}
