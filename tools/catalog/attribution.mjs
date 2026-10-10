// Renders docs/ATTRIBUTION.md from the catalog manifest (P4-02). Pure and deterministic: the same
// manifest always gives the same text, so CI can compare the committed file with a fresh render.

const cell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

/** @param {{ items: Array<{ id: string, name: { es: string }, license: Record<string, string> }> }} manifest */
export function renderAttribution(manifest) {
  const items = [...manifest.items].sort((a, b) => a.id.localeCompare(b.id));
  const licenses = [...new Set(items.map((item) => item.license.spdx))].sort();
  const lines = [
    '# Atribuciones de assets 3D',
    '',
    '> Generado por `pnpm catalog:build` a partir de `apps/web/src/asset-library/manifest/catalog.json`.',
    '> No editar a mano: `pnpm check` falla si no coincide con el manifiesto.',
    '',
    'Licencias de dependencias de software: [LICENSES.md](LICENSES.md).',
    '`LicenseRef-RoomForge-Proprietary` identifica los modelos creados por el proyecto RoomForge,',
    'con todos los derechos reservados; no es una licencia CC0.',
  ];
  for (const spdx of licenses) {
    const group = items.filter((item) => item.license.spdx === spdx);
    lines.push(
      '',
      `## ${spdx}`,
      '',
      '| ID | Nombre | Autor | Origen | Atribución |',
      '|---|---|---|---|---|',
    );
    for (const item of group) {
      const { author, origin, sourceUrl, attribution } = item.license;
      const source = sourceUrl ? `${origin} (<${sourceUrl}>)` : origin;
      lines.push(
        `| \`${item.id}\` | ${cell(item.name.es)} | ${cell(author)} | ${cell(source)} | ${cell(attribution)} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}
