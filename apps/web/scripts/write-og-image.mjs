// Draws the Open Graph / Twitter card `<export>/og.png` after `next build` (see package.json).
// Usage: node scripts/write-og-image.mjs [out-dir]
//
// A post-build script rather than an `og.png/route.tsx`: next/og is an async module, and a single
// one in the app makes Turbopack ship its async-module runtime to every page (+0.45 kB gzip).
// No stock photo to license; the font is the one next/og bundles. The card is brand art in English
// for every locale; the page texts live in src/ui/site/site-messages.ts.
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ImageResponse } from 'next/og.js';
import { createElement as h } from 'react';

const root = resolve(process.argv[2] ?? 'out');

const card = h(
  'div',
  {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: 80,
      background: 'linear-gradient(135deg, #0b0d12 0%, #141824 55%, #1a1e27 100%)',
      color: '#e8ebf2',
    },
  },
  h('div', {
    style: {
      width: 520,
      height: 14,
      borderRadius: 7,
      background: 'linear-gradient(90deg, #ff7a45, #5aa9ff)',
      marginBottom: 48,
    },
  }),
  h('div', { style: { fontSize: 96, fontWeight: 700 } }, 'RoomForge'),
  h(
    'div',
    { style: { fontSize: 44, color: '#a3acbd', marginTop: 24, maxWidth: 980 } },
    'Design rooms, offices and gaming setups in 3D, lit with LED and RGB.',
  ),
);

const image = new ImageResponse(card, { width: 1200, height: 630 });
await writeFile(join(root, 'og.png'), Buffer.from(await image.arrayBuffer()));
console.log(`og.png written in ${root}`);
