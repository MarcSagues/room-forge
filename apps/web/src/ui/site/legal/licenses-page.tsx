import { type CatalogManifestItem, OWN_LICENSE } from '@roomforge/core';
import type { Locale } from '../../i18n';
import { siteMessages } from '../site-messages';
import dependencies from './dependencies.json';
import { ProsePage } from './legal-page';

export interface DependencyRow {
  readonly name: string;
  readonly versions: readonly string[];
  readonly license: string;
}

/** Written by `pnpm licenses:report` together with docs/LICENSES.md (a test keeps them equal). */
export const shippedDependencies: readonly DependencyRow[] = dependencies.packages;

const cell = 'border-subtle border-b px-3 py-2 text-left align-top';

/**
 * Licences and attributions, generated from data rather than copied by hand: the catalog
 * manifest (models) and the dependency report (software). The values are rendered as text.
 */
export function LicensesPage({
  locale,
  models,
  packages = shippedDependencies,
}: {
  locale: Locale;
  models: readonly CatalogManifestItem[];
  packages?: readonly DependencyRow[];
}) {
  const t = siteMessages[locale].licensesPage;
  return (
    <ProsePage title={t.title} notices={<p className="text-fg-muted">{t.intro}</p>}>
      <section aria-labelledby="models-title" className="flex flex-col gap-3">
        <h2 id="models-title" className="font-semibold text-2xl">
          {t.modelsTitle}
        </h2>
        <p className="text-fg-muted">{t.modelsIntro}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.modelColumns.name}
                </th>
                <th scope="col" className={cell}>
                  {t.modelColumns.author}
                </th>
                <th scope="col" className={cell}>
                  {t.modelColumns.license}
                </th>
                <th scope="col" className={cell}>
                  {t.modelColumns.attribution}
                </th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => {
                const own = model.license.spdx === OWN_LICENSE;
                return (
                  <tr key={model.id}>
                    <th scope="row" className={`${cell} font-normal`}>
                      {model.name[locale]}
                    </th>
                    <td className={cell}>{model.license.author}</td>
                    <td className={cell}>{own ? t.ownLicense : model.license.spdx}</td>
                    <td className={cell}>
                      {own ? '—' : model.license.attribution}
                      {!own && model.license.sourceUrl && (
                        <>
                          {' '}
                          <a href={model.license.sourceUrl} className="underline" rel="noreferrer">
                            {model.license.sourceUrl}
                          </a>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="software-title" className="flex flex-col gap-3">
        <h2 id="software-title" className="font-semibold text-2xl">
          {t.softwareTitle}
        </h2>
        <p className="text-fg-muted">{t.softwareIntro}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.softwareColumns.name}
                </th>
                <th scope="col" className={cell}>
                  {t.softwareColumns.version}
                </th>
                <th scope="col" className={cell}>
                  {t.softwareColumns.license}
                </th>
              </tr>
            </thead>
            <tbody>
              {packages.map((row) => (
                <tr key={row.name}>
                  <th scope="row" className={`${cell} font-mono font-normal`}>
                    {row.name}
                  </th>
                  <td className={cell}>{row.versions.join(', ')}</td>
                  <td className={cell}>{row.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="fonts-title" className="flex flex-col gap-3">
        <h2 id="fonts-title" className="font-semibold text-2xl">
          {t.fontsTitle}
        </h2>
        <ul className="list-disc pl-6 text-fg-muted">
          {t.fonts.map((font) => (
            <li key={font}>{font}</li>
          ))}
        </ul>
      </section>
    </ProsePage>
  );
}
