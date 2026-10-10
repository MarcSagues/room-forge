// The catalog's own models are built from code (P4-02, ADR-0007): the committed GLB files, the
// manifest and docs/ATTRIBUTION.md must be exactly what tools/catalog/build-models.mjs produces,
// so none of them can be edited by hand. Run with: pnpm test:arch
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderAttribution } from '../catalog/attribution.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the committed models, manifest and attributions are what the generator builds', () => {
  const output = execFileSync(
    process.execPath,
    [resolve(root, 'tools/catalog/build-models.mjs'), '--check'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.match(output, /Checked 9 models/);
});

test('the attributions page lists every item under its licence, sorted, with its source', () => {
  const item = (id, spdx, sourceUrl) => ({
    id,
    name: { es: `Nombre ${id}` },
    license: {
      spdx,
      author: 'A | B',
      origin: 'Pack',
      attribution: 'Line',
      ...(sourceUrl ? { sourceUrl } : {}),
    },
  });
  const manifest = {
    items: [
      item('z.one', 'CC0-1.0', 'https://example.test/pack'),
      item('a.two', 'LicenseRef-RoomForge-Proprietary'),
    ],
  };
  const text = renderAttribution(manifest);
  assert.equal(text, renderAttribution({ items: [...manifest.items].reverse() }));
  assert.ok(text.indexOf('## CC0-1.0') < text.indexOf('## LicenseRef-RoomForge-Proprietary'));
  assert.match(
    text,
    /\| `z\.one` \| Nombre z\.one \| A \\\| B \| Pack \(<https:\/\/example\.test\/pack>\) \| Line \|/,
  );
  assert.match(text, /\| `a\.two` \| Nombre a\.two \| A \\\| B \| Pack \| Line \|/);
});
